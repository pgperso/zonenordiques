-- Pool LNH — production hardening + full rules + transactions (Phase 2.5).
--
-- Addresses the backend audit and adds what a "pro" pool needs:
--   * Roster writes go ONLY through SECURITY DEFINER RPCs (pool_save_roster,
--     pool_make_transaction) — direct client writes are revoked. This fixes
--     the non-atomic save (data loss), the O(n^2) per-row trigger, and makes
--     budget/cap enforcement concurrency-safe via a per-entry FOR UPDATE lock.
--   * pool_lock_entry re-checks budget under the lock; a guard trigger stops
--     clients from self-setting is_locked/effective_from/spent_cents (the
--     exploitable RLS bypass).
--   * Configurable barème expanded to every stat we actually ingest.
--   * Transactions ("échanges"): unilateral roster swaps against the shared
--     pool, with windowed scoring (added player counts from the swap date,
--     dropped player's points are kept up to it).
--
-- A transaction-local GUC `pool.privileged` marks writes coming from our
-- trusted RPCs so triggers can allow post-lock swaps while still blocking
-- direct client tampering.

-- 0. More ingested stats (additive; default 0 for already-synced games) ------
ALTER TABLE public.nhl_player_game_stats
  ADD COLUMN IF NOT EXISTS takeaways INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS giveaways INT NOT NULL DEFAULT 0;

-- 1. Expanded configurable barème -------------------------------------------
ALTER TABLE public.pool_scoring_rules DROP CONSTRAINT IF EXISTS pool_scoring_rules_stat_key_check;
ALTER TABLE public.pool_scoring_rules ADD CONSTRAINT pool_scoring_rules_stat_key_check
  CHECK (stat_key IN (
    -- skater
    'goals','assists','plus_minus','pim','shots','pp_goals','hits','blocked_shots','takeaways','giveaways',
    -- goalie
    'win','loss','ot_loss','shutout','save','goal_against'
  ));

-- 2. Season-level rule config (transactions, tiebreaker, privacy) ------------
ALTER TABLE public.pool_seasons
  ADD COLUMN IF NOT EXISTS transactions_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS max_transactions INT NOT NULL DEFAULT 0,        -- 0 = none, high = effectively unlimited
  ADD COLUMN IF NOT EXISTS transaction_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tiebreaker TEXT NOT NULL DEFAULT 'fewest_games'
    CHECK (tiebreaker IN ('fewest_games','none')),
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Toronto';

ALTER TABLE public.pool_entries
  ADD COLUMN IF NOT EXISTS transactions_used INT NOT NULL DEFAULT 0;

-- 3. Windowed roster slots ---------------------------------------------------
-- A slot now has a [effective_from, effective_to) window so a swapped-out
-- player keeps the points he earned while rostered. Active slot: effective_to
-- IS NULL. A player can reappear after being dropped, so the old full UNIQUE
-- is replaced by a partial unique on currently-active rows only.
ALTER TABLE public.pool_roster_slots
  ADD COLUMN IF NOT EXISTS effective_from DATE NOT NULL DEFAULT '0001-01-01',
  ADD COLUMN IF NOT EXISTS effective_to DATE;

ALTER TABLE public.pool_roster_slots DROP CONSTRAINT IF EXISTS pool_roster_slots_entry_id_player_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_pool_roster_active
  ON public.pool_roster_slots(entry_id, player_id) WHERE effective_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_pool_roster_active ON public.pool_roster_slots(entry_id) WHERE effective_to IS NULL;

-- 4. Transactions log --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pool_transactions (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id         BIGINT NOT NULL REFERENCES public.pool_entries(id) ON DELETE CASCADE,
  dropped_player_id BIGINT NOT NULL REFERENCES public.nhl_players(player_id),
  added_player_id  BIGINT NOT NULL REFERENCES public.nhl_players(player_id),
  slot_position    TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pool_transactions_entry ON public.pool_transactions(entry_id);

ALTER TABLE public.pool_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pool_transactions_read ON public.pool_transactions;
CREATE POLICY pool_transactions_read ON public.pool_transactions FOR SELECT USING (true);
-- writes only via RPC (service/definer) — no client policy.

-- 5. Helper: is this write coming from one of our trusted RPCs? --------------
-- Returns FALSE (never NULL) when the flag is unset, so `NOT pool_is_privileged()`
-- is reliably TRUE for ordinary client writes — otherwise the guards below
-- would silently no-op on a three-valued NULL.
CREATE OR REPLACE FUNCTION public.pool_is_privileged()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('pool.privileged', true) = '1', false);
$$;

-- 6. Slot validate trigger (add search_path; allow post-lock swaps via RPC) --
CREATE OR REPLACE FUNCTION public.pool_slot_validate()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_season_id BIGINT;
  v_locked    BOOLEAN;
  v_lock_at   TIMESTAMPTZ;
  v_price     public.pool_player_prices%ROWTYPE;
BEGIN
  SELECT e.season_id, e.is_locked, s.lock_at
    INTO v_season_id, v_locked, v_lock_at
  FROM public.pool_entries e
  JOIN public.pool_seasons s ON s.id = e.season_id
  WHERE e.id = NEW.entry_id;

  -- Lock check applies to client/builder writes; trusted RPCs (transactions)
  -- legitimately edit a locked roster and set the privileged flag.
  IF NOT public.pool_is_privileged()
     AND (v_locked OR (v_lock_at IS NOT NULL AND NOW() >= v_lock_at)) THEN
    RAISE EXCEPTION 'Alignement verrouillé — modification impossible';
  END IF;

  SELECT * INTO v_price FROM public.pool_player_prices
  WHERE season_id = v_season_id AND player_id = NEW.player_id;
  IF NOT FOUND OR NOT v_price.is_draftable THEN
    RAISE EXCEPTION 'Joueur % non disponible pour cette saison', NEW.player_id;
  END IF;
  IF v_price.position <> NEW.slot_position THEN
    RAISE EXCEPTION 'Position % ne correspond pas au joueur (%)', NEW.slot_position, v_price.position;
  END IF;

  NEW.price_cents := v_price.price_cents;
  RETURN NEW;
END $$;

-- Validate only on INSERT now: a slot's player never changes (a transaction
-- INSERTs a new slot and only UPDATEs effective_to on the old one — which must
-- not re-validate the dropped, possibly-now-undraftable player).
DROP TRIGGER IF EXISTS trg_pool_slot_validate ON public.pool_roster_slots;
CREATE TRIGGER trg_pool_slot_validate
  BEFORE INSERT ON public.pool_roster_slots
  FOR EACH ROW EXECUTE FUNCTION public.pool_slot_validate();

-- Drop the old per-row budget/cap trigger — enforcement now lives in the RPCs
-- (computed once, under a row lock). Keeps writes O(n) and concurrency-safe.
DROP TRIGGER IF EXISTS trg_pool_roster_enforce ON public.pool_roster_slots;
DROP FUNCTION IF EXISTS public.pool_roster_enforce();

-- 7. Guard: clients may not tamper with protected entry columns --------------
CREATE OR REPLACE FUNCTION public.pool_entry_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.pool_is_privileged() THEN
    IF NEW.is_locked IS DISTINCT FROM OLD.is_locked
       OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.spent_cents IS DISTINCT FROM OLD.spent_cents
       OR NEW.transactions_used IS DISTINCT FROM OLD.transactions_used
       OR NEW.season_id IS DISTINCT FROM OLD.season_id THEN
      RAISE EXCEPTION 'Champ protégé — passez par les fonctions du pool';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pool_entry_guard ON public.pool_entries;
CREATE TRIGGER trg_pool_entry_guard
  BEFORE UPDATE ON public.pool_entries
  FOR EACH ROW EXECUTE FUNCTION public.pool_entry_guard();

-- 8. pool_save_roster — the single atomic pre-lock roster write path ---------
CREATE OR REPLACE FUNCTION public.pool_save_roster(p_entry_id BIGINT, p_picks JSONB)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry  public.pool_entries%ROWTYPE;
  v_season public.pool_seasons%ROWTYPE;
  v_spent  BIGINT;
  v_f INT; v_d INT; v_g INT;
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

  -- Replace the whole roster (no history exists pre-lock).
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

  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;
  IF v_f > v_season.roster_f OR v_d > v_season.roster_d OR v_g > v_season.roster_g THEN
    RAISE EXCEPTION 'Trop de joueurs (F:% D:% G:%)', v_f, v_d, v_g;
  END IF;

  UPDATE public.pool_entries SET spent_cents = v_spent, updated_at = NOW() WHERE id = p_entry_id;
END $$;

-- 9. pool_lock_entry — re-check budget, lock the row, TZ-correct dates -------
CREATE OR REPLACE FUNCTION public.pool_lock_entry(p_entry_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry  public.pool_entries%ROWTYPE;
  v_season public.pool_seasons%ROWTYPE;
  v_spent  BIGINT;
  v_f INT; v_d INT; v_g INT;
  v_today DATE;
  v_started BOOLEAN;
BEGIN
  PERFORM set_config('pool.privileged', '1', true);
  SELECT * INTO v_entry FROM public.pool_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscription introuvable'; END IF;
  IF v_entry.member_id <> auth.uid() THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  IF v_entry.is_locked THEN RAISE EXCEPTION 'Déjà verrouillé'; END IF;

  SELECT * INTO v_season FROM public.pool_seasons WHERE id = v_entry.season_id;
  v_today := (NOW() AT TIME ZONE v_season.timezone)::date;

  SELECT COALESCE(SUM(price_cents),0),
         COUNT(*) FILTER (WHERE slot_position='F'),
         COUNT(*) FILTER (WHERE slot_position='D'),
         COUNT(*) FILTER (WHERE slot_position='G')
    INTO v_spent, v_f, v_d, v_g
  FROM public.pool_roster_slots WHERE entry_id = p_entry_id AND effective_to IS NULL;

  IF v_f <> v_season.roster_f OR v_d <> v_season.roster_d OR v_g <> v_season.roster_g THEN
    RAISE EXCEPTION 'Alignement incomplet (F:%/% D:%/% G:%/%)',
      v_f, v_season.roster_f, v_d, v_season.roster_d, v_g, v_season.roster_g;
  END IF;
  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.nhl_games g
    WHERE g.season = v_season.nhl_season AND g.game_type = ANY (v_season.game_types)
      AND g.game_state IN ('OFF','FINAL') AND g.game_date < v_today
  ) INTO v_started;

  UPDATE public.pool_entries
     SET is_locked = TRUE, locked_at = NOW(),
         effective_from = CASE WHEN v_started THEN v_today ELSE NULL END,
         updated_at = NOW()
   WHERE id = p_entry_id;
END $$;

-- 10. pool_make_transaction — swap one player for another (post-lock) --------
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

  -- Close the dropped slot's window; keep it for past scoring.
  UPDATE public.pool_roster_slots SET effective_to = v_today WHERE id = v_slot.id;
  -- Open the new slot from today.
  INSERT INTO public.pool_roster_slots (entry_id, player_id, slot_position, effective_from)
  VALUES (p_entry_id, p_add_player, v_slot.slot_position, v_today);

  -- Recompute current spend (active slots) and re-check budget.
  SELECT COALESCE(SUM(price_cents),0) INTO v_spent
  FROM public.pool_roster_slots WHERE entry_id = p_entry_id AND effective_to IS NULL;
  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé après l''échange (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;

  UPDATE public.pool_entries
     SET spent_cents = v_spent, transactions_used = transactions_used + 1, updated_at = NOW()
   WHERE id = p_entry_id;
  INSERT INTO public.pool_transactions (entry_id, dropped_player_id, added_player_id, slot_position)
  VALUES (p_entry_id, p_drop_player, p_add_player, v_slot.slot_position);
END $$;

-- 11. Scoring view — rename season_id→pool_season_id, add the new stats ------
DROP VIEW IF EXISTS public.pool_player_game_points;
CREATE VIEW public.pool_player_game_points AS
SELECT
  ps.id AS pool_season_id, s.game_id, s.player_id, g.game_date,
    s.goals          * COALESCE(rk.goals, 0)
  + s.assists        * COALESCE(rk.assists, 0)
  + s.plus_minus     * COALESCE(rk.plus_minus, 0)
  + s.pim            * COALESCE(rk.pim, 0)
  + s.shots          * COALESCE(rk.shots, 0)
  + s.powerplay_goals* COALESCE(rk.pp_goals, 0)
  + s.hits           * COALESCE(rk.hits, 0)
  + s.blocked_shots  * COALESCE(rk.blocked_shots, 0)
  + s.takeaways      * COALESCE(rk.takeaways, 0)
  + s.giveaways      * COALESCE(rk.giveaways, 0)
  + (CASE WHEN s.decision = 'W' THEN 1 ELSE 0 END) * COALESCE(rk.win, 0)
  + (CASE WHEN s.decision = 'L' THEN 1 ELSE 0 END) * COALESCE(rk.loss, 0)
  + (CASE WHEN s.decision = 'O' THEN 1 ELSE 0 END) * COALESCE(rk.ot_loss, 0)
  + (CASE WHEN s.shutout THEN 1 ELSE 0 END)        * COALESCE(rk.shutout, 0)
  + COALESCE(s.saves, 0)         * COALESCE(rk.save, 0)
  + COALESCE(s.goals_against, 0) * COALESCE(rk.goal_against, 0)
  AS pts
FROM public.nhl_player_game_stats s
JOIN public.nhl_games g    ON g.game_id = s.game_id
JOIN public.pool_seasons ps ON ps.nhl_season = g.season
  AND g.game_type = ANY (ps.game_types)
  AND g.game_state IN ('OFF', 'FINAL')
LEFT JOIN LATERAL (
  SELECT
    MAX(coefficient) FILTER (WHERE stat_key='goals')         AS goals,
    MAX(coefficient) FILTER (WHERE stat_key='assists')       AS assists,
    MAX(coefficient) FILTER (WHERE stat_key='plus_minus')    AS plus_minus,
    MAX(coefficient) FILTER (WHERE stat_key='pim')           AS pim,
    MAX(coefficient) FILTER (WHERE stat_key='shots')         AS shots,
    MAX(coefficient) FILTER (WHERE stat_key='pp_goals')      AS pp_goals,
    MAX(coefficient) FILTER (WHERE stat_key='hits')          AS hits,
    MAX(coefficient) FILTER (WHERE stat_key='blocked_shots') AS blocked_shots,
    MAX(coefficient) FILTER (WHERE stat_key='takeaways')     AS takeaways,
    MAX(coefficient) FILTER (WHERE stat_key='giveaways')     AS giveaways,
    MAX(coefficient) FILTER (WHERE stat_key='win')           AS win,
    MAX(coefficient) FILTER (WHERE stat_key='loss')          AS loss,
    MAX(coefficient) FILTER (WHERE stat_key='ot_loss')       AS ot_loss,
    MAX(coefficient) FILTER (WHERE stat_key='shutout')       AS shutout,
    MAX(coefficient) FILTER (WHERE stat_key='save')          AS save,
    MAX(coefficient) FILTER (WHERE stat_key='goal_against')  AS goal_against
  FROM public.pool_scoring_rules WHERE season_id = ps.id
) rk ON TRUE;

-- 12. Standings refresh — windowed scoring + tiebreaker + single-flight ------
CREATE OR REPLACE FUNCTION public.pool_refresh_standings(p_season_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Single-flight: skip if another refresh for this season holds the lock.
  IF NOT pg_try_advisory_xact_lock(p_season_id) THEN RETURN; END IF;

  WITH per_entry AS (
    SELECT e.id AS entry_id,
           COALESCE(SUM(pgp.pts),0) AS pts,
           COUNT(pgp.game_id)       AS gc
    FROM public.pool_entries e
    JOIN public.pool_roster_slots rs ON rs.entry_id = e.id
    LEFT JOIN public.pool_player_game_points pgp
           ON pgp.player_id = rs.player_id
          AND pgp.pool_season_id = e.season_id
          AND pgp.game_date >= GREATEST(rs.effective_from, COALESCE(e.effective_from, '0001-01-01'::date))
          AND (rs.effective_to IS NULL OR pgp.game_date < rs.effective_to)
    WHERE e.season_id = p_season_id
    GROUP BY e.id
  ), ranked AS (
    SELECT entry_id, pts, gc,
           RANK() OVER (ORDER BY pts DESC, gc ASC) AS rnk  -- tiebreak: fewest games
    FROM per_entry
  )
  INSERT INTO public.pool_standings (season_id, entry_id, fantasy_points, rank, games_counted, computed_at)
  SELECT p_season_id, entry_id, pts, rnk, gc, NOW() FROM ranked
  ON CONFLICT (season_id, entry_id) DO UPDATE
    SET fantasy_points = EXCLUDED.fantasy_points, rank = EXCLUDED.rank,
        games_counted = EXCLUDED.games_counted, computed_at = EXCLUDED.computed_at;
END $$;

-- 13. Lock down write paths --------------------------------------------------
-- No direct client writes to roster slots — RPCs only.
DROP POLICY IF EXISTS pool_roster_write ON public.pool_roster_slots;

-- Standings/refresh: derived data, recomputed by the cron only.
REVOKE EXECUTE ON FUNCTION public.pool_refresh_standings(BIGINT) FROM anon, authenticated;
-- The roster/lock/transaction RPCs are user-facing (they self-check ownership).
GRANT EXECUTE ON FUNCTION public.pool_save_roster(BIGINT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pool_lock_entry(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pool_make_transaction(BIGINT, BIGINT, BIGINT) TO authenticated;
