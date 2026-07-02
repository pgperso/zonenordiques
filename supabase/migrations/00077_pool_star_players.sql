-- Pool LNH — "joueurs vedettes". When a season has stars_enabled, each pooler
-- designates one star forward and one star defenseman among their picks; those
-- players' points count DOUBLE in the standings. Admin can turn the concept off.

ALTER TABLE public.pool_seasons
  ADD COLUMN IF NOT EXISTS stars_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.pool_entries
  ADD COLUMN IF NOT EXISTS star_forward_id BIGINT REFERENCES public.nhl_players(player_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS star_defense_id BIGINT REFERENCES public.nhl_players(player_id) ON DELETE SET NULL;

-- ── Set the caller's star forward + defenseman (pre-lock) ──────────────────
CREATE OR REPLACE FUNCTION public.pool_set_stars(p_entry_id BIGINT, p_forward BIGINT, p_defense BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry public.pool_entries%ROWTYPE; v_season public.pool_seasons%ROWTYPE;
BEGIN
  PERFORM set_config('pool.privileged', '1', true);
  SELECT * INTO v_entry FROM public.pool_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscription introuvable'; END IF;
  IF v_entry.member_id <> auth.uid() THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  SELECT * INTO v_season FROM public.pool_seasons WHERE id = v_entry.season_id;
  IF v_season.lock_at IS NOT NULL AND NOW() >= v_season.lock_at THEN
    RAISE EXCEPTION 'La période de composition est terminée';
  END IF;
  IF p_forward IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pool_roster_slots
    WHERE entry_id = p_entry_id AND effective_to IS NULL AND player_id = p_forward AND slot_position = 'F'
  ) THEN RAISE EXCEPTION 'Attaquant vedette invalide'; END IF;
  IF p_defense IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pool_roster_slots
    WHERE entry_id = p_entry_id AND effective_to IS NULL AND player_id = p_defense AND slot_position = 'D'
  ) THEN RAISE EXCEPTION 'Défenseur vedette invalide'; END IF;

  UPDATE public.pool_entries
     SET star_forward_id = p_forward, star_defense_id = p_defense, is_confirmed = FALSE, updated_at = NOW()
   WHERE id = p_entry_id;
END $$;

GRANT EXECUTE ON FUNCTION public.pool_set_stars(BIGINT, BIGINT, BIGINT) TO authenticated;

-- ── save_roster: clear any star that is no longer on the active roster ──────
CREATE OR REPLACE FUNCTION public.pool_save_roster(p_entry_id BIGINT, p_picks JSONB)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry public.pool_entries%ROWTYPE; v_season public.pool_seasons%ROWTYPE;
  v_spent BIGINT; v_f INT; v_d INT; v_g INT;
BEGIN
  PERFORM set_config('pool.privileged', '1', true);
  SELECT * INTO v_entry FROM public.pool_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscription introuvable'; END IF;
  IF v_entry.member_id <> auth.uid() THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  IF v_entry.is_locked THEN RAISE EXCEPTION 'Alignement verrouillé'; END IF;
  SELECT * INTO v_season FROM public.pool_seasons WHERE id = v_entry.season_id;
  IF v_season.lock_at IS NOT NULL AND NOW() >= v_season.lock_at THEN
    RAISE EXCEPTION 'La période de composition est terminée';
  END IF;

  DELETE FROM public.pool_roster_slots WHERE entry_id = p_entry_id;
  INSERT INTO public.pool_roster_slots (entry_id, player_id, slot_position)
  SELECT p_entry_id, (x->>'player_id')::BIGINT, x->>'slot_position'
  FROM jsonb_array_elements(p_picks) x;

  SELECT COALESCE(SUM(price_cents),0),
         COUNT(*) FILTER (WHERE slot_position='F'),
         COUNT(*) FILTER (WHERE slot_position='D'),
         COUNT(*) FILTER (WHERE slot_position='G')
    INTO v_spent, v_f, v_d, v_g
  FROM public.pool_roster_slots WHERE entry_id = p_entry_id AND effective_to IS NULL;

  v_spent := v_spent + public.pool_team_price(v_entry.season_id, v_entry.team_pick);

  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;
  IF v_f > v_season.roster_f OR v_d > v_season.roster_d OR v_g > v_season.roster_g THEN
    RAISE EXCEPTION 'Trop de joueurs (F:% D:% G:%)', v_f, v_d, v_g;
  END IF;

  -- Drop stars that are no longer rostered.
  UPDATE public.pool_entries e SET
    star_forward_id = CASE WHEN EXISTS (SELECT 1 FROM public.pool_roster_slots rs
      WHERE rs.entry_id = e.id AND rs.effective_to IS NULL AND rs.player_id = e.star_forward_id) THEN e.star_forward_id ELSE NULL END,
    star_defense_id = CASE WHEN EXISTS (SELECT 1 FROM public.pool_roster_slots rs
      WHERE rs.entry_id = e.id AND rs.effective_to IS NULL AND rs.player_id = e.star_defense_id) THEN e.star_defense_id ELSE NULL END
  WHERE e.id = p_entry_id;

  UPDATE public.pool_entries SET spent_cents = v_spent, is_confirmed = FALSE, updated_at = NOW() WHERE id = p_entry_id;
END $$;

-- ── confirm_entry: require both stars when the concept is on ────────────────
CREATE OR REPLACE FUNCTION public.pool_confirm_entry(p_entry_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry public.pool_entries%ROWTYPE; v_season public.pool_seasons%ROWTYPE;
  v_spent BIGINT; v_f INT; v_d INT; v_g INT;
BEGIN
  PERFORM set_config('pool.privileged', '1', true);
  SELECT * INTO v_entry FROM public.pool_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscription introuvable'; END IF;
  IF v_entry.member_id <> auth.uid() THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  SELECT * INTO v_season FROM public.pool_seasons WHERE id = v_entry.season_id;
  IF v_season.lock_at IS NOT NULL AND NOW() >= v_season.lock_at THEN
    RAISE EXCEPTION 'La période de composition est terminée';
  END IF;

  SELECT COALESCE(SUM(price_cents),0),
         COUNT(*) FILTER (WHERE slot_position='F'),
         COUNT(*) FILTER (WHERE slot_position='D'),
         COUNT(*) FILTER (WHERE slot_position='G')
    INTO v_spent, v_f, v_d, v_g
  FROM public.pool_roster_slots WHERE entry_id = p_entry_id AND effective_to IS NULL;
  v_spent := v_spent + public.pool_team_price(v_entry.season_id, v_entry.team_pick);

  IF v_f <> v_season.roster_f OR v_d <> v_season.roster_d OR v_g <> v_season.roster_g THEN
    RAISE EXCEPTION 'Alignement incomplet (att %/%, déf %/%, gardiens %/%)',
      v_f, v_season.roster_f, v_d, v_season.roster_d, v_g, v_season.roster_g;
  END IF;
  IF v_season.roster_teams > 0 AND v_entry.team_pick IS NULL THEN
    RAISE EXCEPTION 'Choisis une équipe de la LNH';
  END IF;
  IF v_season.stars_enabled AND (v_entry.star_forward_id IS NULL OR v_entry.star_defense_id IS NULL) THEN
    RAISE EXCEPTION 'Choisis un attaquant vedette et un défenseur vedette';
  END IF;
  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;

  UPDATE public.pool_entries SET is_confirmed = TRUE, confirmed_at = NOW(), updated_at = NOW() WHERE id = p_entry_id;
END $$;

-- ── make_transaction: a traded-away star moves to the replacement ──────────
CREATE OR REPLACE FUNCTION public.pool_make_transaction(
  p_entry_id BIGINT, p_drop_player BIGINT, p_add_player BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry  public.pool_entries%ROWTYPE;
  v_season public.pool_seasons%ROWTYPE;
  v_slot   public.pool_roster_slots%ROWTYPE;
  v_add    public.pool_player_prices%ROWTYPE;
  v_today  DATE;
  v_spent  BIGINT;
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

  SELECT * INTO v_slot FROM public.pool_roster_slots
  WHERE entry_id = p_entry_id AND player_id = p_drop_player AND effective_to IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Joueur à retirer absent de l''alignement'; END IF;

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

  UPDATE public.pool_roster_slots SET effective_to = v_today WHERE id = v_slot.id;
  INSERT INTO public.pool_roster_slots (entry_id, player_id, slot_position, effective_from)
  VALUES (p_entry_id, p_add_player, v_slot.slot_position, v_today);

  SELECT COALESCE(SUM(price_cents),0) INTO v_spent
  FROM public.pool_roster_slots WHERE entry_id = p_entry_id AND effective_to IS NULL;
  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé après l''échange (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;

  UPDATE public.pool_entries
     SET spent_cents = v_spent,
         transactions_used = transactions_used + 1,
         star_forward_id = CASE WHEN star_forward_id = p_drop_player THEN p_add_player ELSE star_forward_id END,
         star_defense_id = CASE WHEN star_defense_id = p_drop_player THEN p_add_player ELSE star_defense_id END,
         updated_at = NOW()
   WHERE id = p_entry_id;
  INSERT INTO public.pool_transactions (entry_id, dropped_player_id, added_player_id, slot_position)
  VALUES (p_entry_id, p_drop_player, p_add_player, v_slot.slot_position);
END $$;

-- ── refresh_standings: double the star players' points ─────────────────────
CREATE OR REPLACE FUNCTION public.pool_refresh_standings(p_season_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_last_day DATE; v_stars BOOLEAN;
BEGIN
  IF NOT pg_try_advisory_xact_lock(p_season_id) THEN RETURN; END IF;

  SELECT stars_enabled INTO v_stars FROM public.pool_seasons WHERE id = p_season_id;

  SELECT MAX(game_date) INTO v_last_day
  FROM public.pool_player_game_points WHERE pool_season_id = p_season_id;

  WITH player_pts AS (
    SELECT e.id AS entry_id,
           COALESCE(SUM(pgp.pts * CASE WHEN v_stars AND rs.player_id IN (e.star_forward_id, e.star_defense_id) THEN 2 ELSE 1 END), 0) AS pts,
           COUNT(pgp.game_id) AS gc,
           COALESCE(SUM(pgp.pts * CASE WHEN v_stars AND rs.player_id IN (e.star_forward_id, e.star_defense_id) THEN 2 ELSE 1 END) FILTER (WHERE pgp.game_date = v_last_day), 0) AS last_pts
    FROM public.pool_entries e
    JOIN public.pool_roster_slots rs ON rs.entry_id = e.id
    LEFT JOIN public.pool_player_game_points pgp
           ON pgp.player_id = rs.player_id
          AND pgp.pool_season_id = e.season_id
          AND pgp.game_date >= GREATEST(rs.effective_from, COALESCE(e.effective_from, '0001-01-01'::date))
          AND (rs.effective_to IS NULL OR pgp.game_date < rs.effective_to)
    WHERE e.season_id = p_season_id
    GROUP BY e.id
  ), team_pts AS (
    SELECT e.id AS entry_id,
           COALESCE(SUM(tgp.pts), 0) AS pts,
           COALESCE(SUM(tgp.pts) FILTER (WHERE tgp.game_date = v_last_day), 0) AS last_pts
    FROM public.pool_entries e
    LEFT JOIN public.pool_team_game_points tgp
           ON tgp.pool_season_id = e.season_id
          AND tgp.team_abbrev = e.team_pick
          AND tgp.game_date >= COALESCE(e.effective_from, '0001-01-01'::date)
    WHERE e.season_id = p_season_id
    GROUP BY e.id
  ), combined AS (
    SELECT pp.entry_id,
           pp.pts + COALESCE(tp.pts, 0) AS pts,
           pp.gc,
           pp.last_pts + COALESCE(tp.last_pts, 0) AS last_pts
    FROM player_pts pp
    LEFT JOIN team_pts tp ON tp.entry_id = pp.entry_id
  ), ranked AS (
    SELECT entry_id, pts, gc, last_pts, RANK() OVER (ORDER BY pts DESC, gc ASC) AS rnk
    FROM combined
  )
  INSERT INTO public.pool_standings
    (season_id, entry_id, fantasy_points, rank, games_counted, points_last_day, last_day, computed_at)
  SELECT p_season_id, entry_id, pts, rnk, gc, last_pts, v_last_day, NOW() FROM ranked
  ON CONFLICT (season_id, entry_id) DO UPDATE
    SET previous_rank   = public.pool_standings.rank,
        fantasy_points  = EXCLUDED.fantasy_points,
        rank            = EXCLUDED.rank,
        games_counted   = EXCLUDED.games_counted,
        points_last_day = EXCLUDED.points_last_day,
        last_day        = EXCLUDED.last_day,
        computed_at     = EXCLUDED.computed_at;
END $$;
