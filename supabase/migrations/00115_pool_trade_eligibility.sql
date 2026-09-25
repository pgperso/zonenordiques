-- Pool LNH — a player has to play before he can be traded away.
--
-- Owner's rule: you may only trade a player once he has dressed for at least
-- `trade_min_games` games FOR YOU (default 5, configurable) — unless he is
-- currently sitting out, in which case you are not asked to carry a player who
-- is not playing.
--
-- Two things this is deliberately NOT:
--
--  * Not "5 games this season". The counter starts when the player joins YOUR
--    roster, so a player picked up mid-season owes you the same 5 games as one
--    drafted in September. Counting league-wide would block every trade for
--    the first two weeks and then stop restraining anything at all.
--
--  * Not an injury list. Nothing in this database knows who is hurt, and the
--    NHL publishes no dependable injury feed. What it knows is who dressed.
--    So "sitting out" means: his club has played its last
--    `trade_injury_missed_games` games (default 1) and he was in none of them.
--    The moment he plays again the exception lapses on its own — there is no
--    status to set, clear, or forget to clear. It also covers healthy
--    scratches and minor-league assignments, which serve the same purpose:
--    you are not stuck with a player who is not playing.
--
-- Idempotent.

-- ── 1. Season config ──────────────────────────────────────────────────────
ALTER TABLE public.pool_seasons
  ADD COLUMN IF NOT EXISTS trade_min_games           INT NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS trade_injury_missed_games INT NOT NULL DEFAULT 1;

ALTER TABLE public.pool_seasons DROP CONSTRAINT IF EXISTS pool_seasons_trade_min_games_ck;
ALTER TABLE public.pool_seasons
  ADD CONSTRAINT pool_seasons_trade_min_games_ck CHECK (trade_min_games >= 0);

-- At least 1: "missed zero games" would make everyone permanently tradeable.
ALTER TABLE public.pool_seasons DROP CONSTRAINT IF EXISTS pool_seasons_trade_injury_ck;
ALTER TABLE public.pool_seasons
  ADD CONSTRAINT pool_seasons_trade_injury_ck CHECK (trade_injury_missed_games >= 1);

COMMENT ON COLUMN public.pool_seasons.trade_min_games IS
  'Games a player must dress for while on an entry''s roster before that entry may trade him. 0 = no restriction.';
COMMENT ON COLUMN public.pool_seasons.trade_injury_missed_games IS
  'A player who dressed for none of his club''s last N final games counts as sitting out, and may be traded regardless of trade_min_games.';

-- ── 2. Games dressed for, while on THIS roster ────────────────────────────
-- Anchored on the slot's effective_from — '0001-01-01' for an original pick
-- (the whole season counts) and the trade date for one acquired since. A
-- mid-season entry's own effective_from applies too, so nobody is credited
-- with games played before they joined the pool.
CREATE OR REPLACE FUNCTION public.pool_games_on_roster(p_entry_id BIGINT, p_player_id BIGINT)
RETURNS INT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::INT
  FROM public.pool_roster_slots rs
  JOIN public.pool_entries e ON e.id = rs.entry_id
  JOIN public.pool_seasons s ON s.id = e.season_id
  JOIN public.nhl_player_game_stats st ON st.player_id = rs.player_id
  JOIN public.nhl_games g ON g.game_id = st.game_id
   AND g.season = s.nhl_season
   AND g.game_type = ANY (s.game_types)
   AND g.game_state IN ('OFF', 'FINAL')
  WHERE rs.entry_id = p_entry_id
    AND rs.player_id = p_player_id
    AND rs.effective_to IS NULL
    AND g.game_date >= GREATEST(rs.effective_from, COALESCE(e.effective_from, '0001-01-01'::date));
$$;

-- ── 3. Is he sitting out right now? ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pool_player_is_out(p_season_id BIGINT, p_player_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_season public.pool_seasons%ROWTYPE;
  v_team   TEXT;
  v_n      INT;
  v_games  BIGINT[];
BEGIN
  SELECT * INTO v_season FROM public.pool_seasons WHERE id = p_season_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  v_n := GREATEST(v_season.trade_injury_missed_games, 1);

  SELECT team_abbrev INTO v_team FROM public.nhl_players WHERE player_id = p_player_id;
  IF v_team IS NULL THEN RETURN FALSE; END IF;

  SELECT ARRAY(
    SELECT g.game_id FROM public.nhl_games g
    WHERE g.season = v_season.nhl_season
      AND g.game_type = ANY (v_season.game_types)
      AND g.game_state IN ('OFF', 'FINAL')
      AND (g.home_abbrev = v_team OR g.away_abbrev = v_team)
    ORDER BY g.game_date DESC, g.game_id DESC
    LIMIT v_n
  ) INTO v_games;

  -- Before the club has played N games there is nothing to have missed.
  IF COALESCE(array_length(v_games, 1), 0) < v_n THEN RETURN FALSE; END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM public.nhl_player_game_stats st
    WHERE st.player_id = p_player_id AND st.game_id = ANY (v_games)
  );
END $$;

-- ── 4. The whole roster's state, for the composer ─────────────────────────
-- The UI has to be able to grey out a player and say why BEFORE the member
-- clicks; an error raised after the fact is a worse way to learn a rule.
-- Rosters are public (00071), so this exposes nothing new.
CREATE OR REPLACE FUNCTION public.pool_trade_eligibility(p_entry_id BIGINT)
RETURNS TABLE (player_id BIGINT, games_played INT, games_required INT,
               is_out BOOLEAN, can_trade BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rs.player_id,
         public.pool_games_on_roster(rs.entry_id, rs.player_id),
         s.trade_min_games,
         public.pool_player_is_out(s.id, rs.player_id),
         public.pool_games_on_roster(rs.entry_id, rs.player_id) >= s.trade_min_games
           OR public.pool_player_is_out(s.id, rs.player_id)
  FROM public.pool_roster_slots rs
  JOIN public.pool_entries e ON e.id = rs.entry_id
  JOIN public.pool_seasons s ON s.id = e.season_id
  WHERE rs.entry_id = p_entry_id AND rs.effective_to IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.pool_trade_eligibility(BIGINT) TO authenticated;

-- ── 5. Enforce it ─────────────────────────────────────────────────────────
-- Body as of 00106, with the eligibility gate added right after the dropped
-- slot is located. Everything else is unchanged: the effective date that
-- protects a game already under way, the star reset from 00078, the free team
-- pick from 00114 (pool_team_price now returns 0).
CREATE OR REPLACE FUNCTION public.pool_make_transaction(
  p_entry_id BIGINT, p_drop_player BIGINT, p_add_player BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry     public.pool_entries%ROWTYPE;
  v_season    public.pool_seasons%ROWTYPE;
  v_slot      public.pool_roster_slots%ROWTYPE;
  v_add       public.pool_player_prices%ROWTYPE;
  v_today     DATE;
  v_effective DATE;
  v_spent     BIGINT;
  v_played    INT;
BEGIN
  PERFORM set_config('pool.privileged', '1', true);
  SELECT * INTO v_entry FROM public.pool_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscription introuvable'; END IF;
  IF v_entry.member_id <> auth.uid() THEN RAISE EXCEPTION 'Non autorisé'; END IF;

  SELECT * INTO v_season FROM public.pool_seasons WHERE id = v_entry.season_id;
  IF NOT v_season.transactions_enabled THEN RAISE EXCEPTION 'Les échanges sont désactivés'; END IF;
  IF v_season.transaction_deadline IS NOT NULL AND NOW() >= v_season.transaction_deadline THEN
    RAISE EXCEPTION 'Date limite des échanges dépassée';
  END IF;
  IF v_entry.transactions_used >= v_season.max_transactions THEN
    RAISE EXCEPTION 'Limite d''échanges atteinte (%/%)', v_entry.transactions_used, v_season.max_transactions;
  END IF;

  v_today := (NOW() AT TIME ZONE v_season.timezone)::date;

  -- Effective date: today unless one of today's games has already started.
  IF EXISTS (
    SELECT 1 FROM public.nhl_games g
    WHERE g.game_date = v_today
      AND (g.start_time_utc <= NOW() OR g.game_state NOT IN ('FUT', 'PRE'))
  ) THEN
    v_effective := v_today + 1;
  ELSE
    v_effective := v_today;
  END IF;

  SELECT * INTO v_slot FROM public.pool_roster_slots
  WHERE entry_id = p_entry_id AND player_id = p_drop_player AND effective_to IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Joueur à retirer absent de l''alignement'; END IF;

  -- The new rule. Checked against the player being dropped, never the one
  -- coming in: the point is that you gave him a fair run, not that he is
  -- available.
  IF v_season.trade_min_games > 0 THEN
    v_played := public.pool_games_on_roster(p_entry_id, p_drop_player);
    IF v_played < v_season.trade_min_games
       AND NOT public.pool_player_is_out(v_entry.season_id, p_drop_player) THEN
      RAISE EXCEPTION
        'Échange impossible : ce joueur a disputé % match(s) pour toi sur les % requis, et il n''a manqué aucun match. Encore % match(s) à attendre.',
        v_played, v_season.trade_min_games, v_season.trade_min_games - v_played;
    END IF;
  END IF;

  SELECT * INTO v_add FROM public.pool_player_prices
  WHERE season_id = v_entry.season_id AND player_id = p_add_player AND is_draftable;
  IF NOT FOUND THEN RAISE EXCEPTION 'Joueur à ajouter non disponible'; END IF;
  IF v_add.position <> v_slot.slot_position THEN
    RAISE EXCEPTION 'Position incompatible (% vs %)', v_add.position, v_slot.slot_position;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pool_roster_slots
             WHERE entry_id = p_entry_id AND player_id = p_add_player AND effective_to IS NULL) THEN
    RAISE EXCEPTION 'Joueur déjà dans l''alignement';
  END IF;

  UPDATE public.pool_roster_slots SET effective_to = v_effective WHERE id = v_slot.id;
  INSERT INTO public.pool_roster_slots (entry_id, player_id, slot_position, effective_from)
  VALUES (p_entry_id, p_add_player, v_slot.slot_position, v_effective);

  SELECT COALESCE(SUM(price_cents),0) INTO v_spent
  FROM public.pool_roster_slots WHERE entry_id = p_entry_id AND effective_to IS NULL;
  v_spent := v_spent + public.pool_team_price(v_entry.season_id, v_entry.team_pick);
  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé après l''échange (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;

  UPDATE public.pool_entries
     SET spent_cents = v_spent,
         transactions_used = transactions_used + 1,
         star_forward_id = CASE WHEN star_forward_id = p_drop_player THEN NULL ELSE star_forward_id END,
         star_defense_id = CASE WHEN star_defense_id = p_drop_player THEN NULL ELSE star_defense_id END,
         updated_at = NOW()
   WHERE id = p_entry_id;
  INSERT INTO public.pool_transactions (entry_id, dropped_player_id, added_player_id, slot_position)
  VALUES (p_entry_id, p_drop_player, p_add_player, v_slot.slot_position);
END $$;

GRANT EXECUTE ON FUNCTION public.pool_make_transaction(BIGINT, BIGINT, BIGINT) TO authenticated;

-- ── Verification ──────────────────────────────────────────────────────────
-- A) The settings are in place:
--      SELECT trade_min_games, trade_injury_missed_games FROM public.pool_seasons WHERE id = 1;
--
-- B) An entry's roster, with who may be traded and why:
--      SELECT np.full_name, t.*
--      FROM public.pool_trade_eligibility(<entry_id>) t
--      JOIN public.nhl_players np ON np.player_id = t.player_id
--      ORDER BY t.can_trade, np.full_name;
--    Before the season starts every games_played is 0 and no club has played,
--    so can_trade is false for everyone — which is correct: there is nothing
--    to trade out of yet.
