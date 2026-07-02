-- Pool LNH — the pool engine (Phase 2).
--
-- Reads from the raw NHL layer (migration 00066_nhl_data) and adds the pool
-- itself: ONE big public season-long pool, salary-cap format, non-exclusive
-- players (everyone can roster McDavid). Roster = 12 F + 6 D + 2 G, fictional
-- budget. Standing = cumulative fantasy points from real NHL stats.
--
-- Design decisions (hardened via review):
--   * Money is stored in integer CENTS (BIGINT), never float.
--   * The scoring barème lives in a table keyed by a whitelisted stat_key,
--     so it's configurable without a code change and a typo can't silently
--     zero-score.
--   * Player price is a STATIC per-season draft-budget input — it never
--     changes from performance. Standing = Σ fantasy points only. This keeps
--     "who's winning" a single monotonic number and makes recompute a pure,
--     idempotent function of (rosters, raw stats, rules).
--   * Roster = one row per slot, with the price snapshotted onto the slot so
--     a later price edit can't retro-change a drafted roster.
--   * Standings are MATERIALISED and refreshed nightly by an idempotent
--     REPLACE function (called by the nhl-sync cron) — not a live view that
--     would re-aggregate millions of rows per page load.
--   * v1 locks the roster for the whole season (no in-season transactions yet).
--     `effective_from` lets a mid-season signup score from their join date.

-- ── A. Seasons ──────────────────────────────────────────────────────────────
-- One row per pool season. UNIQUE(nhl_season) enforces "one big public pool".
CREATE TABLE public.pool_seasons (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nhl_season    INT  NOT NULL UNIQUE,                 -- 20252026, joins nhl_games.season
  name          TEXT NOT NULL,                        -- "Pool LNH 2025-2026"
  game_types    SMALLINT[] NOT NULL DEFAULT '{2}',    -- {2}=regular, {2,3}=incl. playoffs
  budget_cents  BIGINT NOT NULL DEFAULT 10000000000,  -- 100 M$ in cents
  roster_f      SMALLINT NOT NULL DEFAULT 12,
  roster_d      SMALLINT NOT NULL DEFAULT 6,
  roster_g      SMALLINT NOT NULL DEFAULT 2,
  lock_at       TIMESTAMPTZ,                           -- global lineup lock (season start)
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'open', 'locked', 'final')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── B. Scoring rules (configurable barème) ───────────────────────────────────
-- One row per (season, stat_key). Fantasy points = Σ stat_value * coefficient.
-- stat_key is whitelisted. NOTE: the NHL boxscore exposes powerplay GOALS but
-- not powerplay assists, so the AN bonus is a PP-goal bonus ('pp_goals'),
-- which is exactly computable — not a silently-approximated "PP point".
CREATE TABLE public.pool_scoring_rules (
  season_id     BIGINT NOT NULL REFERENCES public.pool_seasons(id) ON DELETE CASCADE,
  stat_key      TEXT   NOT NULL CHECK (stat_key IN (
                   'goals', 'assists', 'pp_goals',
                   'win', 'shutout', 'save', 'goal_against')),
  applies_to    TEXT   NOT NULL CHECK (applies_to IN ('skater', 'goalie')),
  coefficient   NUMERIC(8,3) NOT NULL,
  PRIMARY KEY (season_id, stat_key)
);

-- ── C. Prices (static per season) ────────────────────────────────────────────
-- pool position is collapsed to F/D/G (C/L/R → F) since the roster wants "12 F".
CREATE TABLE public.pool_player_prices (
  season_id     BIGINT NOT NULL REFERENCES public.pool_seasons(id) ON DELETE CASCADE,
  player_id     BIGINT NOT NULL REFERENCES public.nhl_players(player_id) ON DELETE RESTRICT,
  price_cents   BIGINT NOT NULL CHECK (price_cents > 0),
  position      TEXT   NOT NULL CHECK (position IN ('F', 'D', 'G')),
  proj_points   NUMERIC(8,2) NOT NULL DEFAULT 0,      -- projection used for value sort
  is_draftable  BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (season_id, player_id)
);
CREATE INDEX idx_pool_prices_season_pos ON public.pool_player_prices(season_id, position);

-- ── D. Entries (one per member per season) ───────────────────────────────────
CREATE TABLE public.pool_entries (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  season_id      BIGINT NOT NULL REFERENCES public.pool_seasons(id) ON DELETE CASCADE,
  member_id      UUID   NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  team_name      TEXT   NOT NULL,
  spent_cents    BIGINT NOT NULL DEFAULT 0,           -- maintained by trigger
  is_locked      BOOLEAN NOT NULL DEFAULT FALSE,
  locked_at      TIMESTAMPTZ,
  effective_from DATE,                                 -- mid-season: first scored date (NULL = full season)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season_id, member_id)
);
CREATE INDEX idx_pool_entries_member ON public.pool_entries(member_id);

-- ── E. Roster slots (one row per slot) ───────────────────────────────────────
CREATE TABLE public.pool_roster_slots (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id      BIGINT NOT NULL REFERENCES public.pool_entries(id) ON DELETE CASCADE,
  player_id     BIGINT NOT NULL REFERENCES public.nhl_players(player_id) ON DELETE RESTRICT,
  slot_position TEXT   NOT NULL CHECK (slot_position IN ('F', 'D', 'G')),
  price_cents   BIGINT NOT NULL DEFAULT 0,            -- snapshotted from prices by trigger
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entry_id, player_id)                        -- no duplicate player per roster
);
CREATE INDEX idx_pool_roster_entry ON public.pool_roster_slots(entry_id);
CREATE INDEX idx_pool_roster_player ON public.pool_roster_slots(player_id);

-- ── F. Standings (materialised, refreshed nightly) ───────────────────────────
CREATE TABLE public.pool_standings (
  season_id      BIGINT NOT NULL REFERENCES public.pool_seasons(id) ON DELETE CASCADE,
  entry_id       BIGINT NOT NULL REFERENCES public.pool_entries(id) ON DELETE CASCADE,
  fantasy_points NUMERIC(12,3) NOT NULL DEFAULT 0,
  rank           INT,
  games_counted  INT NOT NULL DEFAULT 0,
  computed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (season_id, entry_id)
);
CREATE INDEX idx_pool_standings_rank ON public.pool_standings(season_id, rank);

-- ════════════════════════════════════════════════════════════════════════════
-- Triggers — correctness at the root (not just the app).
-- ════════════════════════════════════════════════════════════════════════════

-- Validate + snapshot a roster slot: player must be draftable for the entry's
-- season, slot position must match the player's pool position, and the price
-- is copied from the price table so it's frozen at draft time. Also refuse any
-- write once the entry (or its season) is locked.
CREATE OR REPLACE FUNCTION public.pool_slot_validate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

  IF v_locked OR (v_lock_at IS NOT NULL AND NOW() >= v_lock_at) THEN
    RAISE EXCEPTION 'Alignement verrouillé — modification impossible';
  END IF;

  SELECT * INTO v_price
  FROM public.pool_player_prices
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

CREATE TRIGGER trg_pool_slot_validate
  BEFORE INSERT OR UPDATE ON public.pool_roster_slots
  FOR EACH ROW EXECUTE FUNCTION public.pool_slot_validate();

-- After any roster change, recompute the entry's spend and enforce both the
-- budget and the per-position slot caps. Sum is monotonic on insert, so a
-- post-row check is equivalent to a final check even for a batch quick-lineup.
CREATE OR REPLACE FUNCTION public.pool_roster_enforce()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_entry_id BIGINT := COALESCE(NEW.entry_id, OLD.entry_id);
  v_season   public.pool_seasons%ROWTYPE;
  v_spent    BIGINT;
  v_f INT; v_d INT; v_g INT;
BEGIN
  SELECT s.* INTO v_season
  FROM public.pool_entries e JOIN public.pool_seasons s ON s.id = e.season_id
  WHERE e.id = v_entry_id;

  SELECT COALESCE(SUM(price_cents), 0),
         COUNT(*) FILTER (WHERE slot_position = 'F'),
         COUNT(*) FILTER (WHERE slot_position = 'D'),
         COUNT(*) FILTER (WHERE slot_position = 'G')
    INTO v_spent, v_f, v_d, v_g
  FROM public.pool_roster_slots WHERE entry_id = v_entry_id;

  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé (% > %)', v_spent, v_season.budget_cents;
  END IF;
  IF v_f > v_season.roster_f OR v_d > v_season.roster_d OR v_g > v_season.roster_g THEN
    RAISE EXCEPTION 'Trop de joueurs à une position (F:% D:% G:%)', v_f, v_d, v_g;
  END IF;

  UPDATE public.pool_entries
     SET spent_cents = v_spent, updated_at = NOW()
   WHERE id = v_entry_id;

  RETURN NULL;  -- AFTER trigger
END $$;

CREATE TRIGGER trg_pool_roster_enforce
  AFTER INSERT OR UPDATE OR DELETE ON public.pool_roster_slots
  FOR EACH ROW EXECUTE FUNCTION public.pool_roster_enforce();

-- ════════════════════════════════════════════════════════════════════════════
-- Lock an entry: the ONLY path that flips is_locked. Validates the full roster
-- atomically (exactly 12F/6D/2G and within budget) and stamps effective_from
-- for mid-season joiners. SECURITY DEFINER + explicit ownership check.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.pool_lock_entry(p_entry_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry  public.pool_entries%ROWTYPE;
  v_season public.pool_seasons%ROWTYPE;
  v_f INT; v_d INT; v_g INT;
  v_season_started BOOLEAN;
BEGIN
  SELECT * INTO v_entry FROM public.pool_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscription introuvable'; END IF;
  IF v_entry.member_id <> auth.uid() THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;
  IF v_entry.is_locked THEN RAISE EXCEPTION 'Déjà verrouillé'; END IF;

  SELECT * INTO v_season FROM public.pool_seasons WHERE id = v_entry.season_id;

  SELECT COUNT(*) FILTER (WHERE slot_position = 'F'),
         COUNT(*) FILTER (WHERE slot_position = 'D'),
         COUNT(*) FILTER (WHERE slot_position = 'G')
    INTO v_f, v_d, v_g
  FROM public.pool_roster_slots WHERE entry_id = p_entry_id;

  IF v_f <> v_season.roster_f OR v_d <> v_season.roster_d OR v_g <> v_season.roster_g THEN
    RAISE EXCEPTION 'Alignement incomplet (F:%/% D:%/% G:%/%)',
      v_f, v_season.roster_f, v_d, v_season.roster_d, v_g, v_season.roster_g;
  END IF;

  -- Mid-season signup: if any in-scope game already finished before today,
  -- this entry scores only from today forward.
  SELECT EXISTS (
    SELECT 1 FROM public.nhl_games g
    WHERE g.season = v_season.nhl_season
      AND g.game_type = ANY (v_season.game_types)
      AND g.game_state IN ('OFF', 'FINAL')
      AND g.game_date < CURRENT_DATE
  ) INTO v_season_started;

  UPDATE public.pool_entries
     SET is_locked = TRUE,
         locked_at = NOW(),
         effective_from = CASE WHEN v_season_started THEN CURRENT_DATE ELSE NULL END,
         updated_at = NOW()
   WHERE id = p_entry_id;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Scoring — per-player-game fantasy points, pivoting raw stats against the rules.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.pool_player_game_points AS
SELECT
  ps.id AS season_id, s.game_id, s.player_id, g.game_date,
    s.goals           * COALESCE(rk.goals, 0)
  + s.assists         * COALESCE(rk.assists, 0)
  + s.powerplay_goals * COALESCE(rk.pp_goals, 0)
  + (CASE WHEN s.decision = 'W' THEN 1 ELSE 0 END) * COALESCE(rk.win, 0)
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
    MAX(coefficient) FILTER (WHERE stat_key = 'goals')        AS goals,
    MAX(coefficient) FILTER (WHERE stat_key = 'assists')      AS assists,
    MAX(coefficient) FILTER (WHERE stat_key = 'pp_goals')     AS pp_goals,
    MAX(coefficient) FILTER (WHERE stat_key = 'win')          AS win,
    MAX(coefficient) FILTER (WHERE stat_key = 'shutout')      AS shutout,
    MAX(coefficient) FILTER (WHERE stat_key = 'save')         AS save,
    MAX(coefficient) FILTER (WHERE stat_key = 'goal_against') AS goal_against
  FROM public.pool_scoring_rules WHERE season_id = ps.id
) rk ON TRUE;

-- Idempotent standings refresh: a pure REPLACE from raw stats. Re-running it
-- (or re-syncing a corrected game) converges — never double-counts.
CREATE OR REPLACE FUNCTION public.pool_refresh_standings(p_season_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  WITH per_entry AS (
    SELECT e.id AS entry_id,
           COALESCE(SUM(pgp.pts), 0) AS pts,
           COUNT(pgp.game_id)        AS gc
    FROM public.pool_entries e
    JOIN public.pool_roster_slots rs ON rs.entry_id = e.id
    LEFT JOIN public.pool_player_game_points pgp
           ON pgp.player_id = rs.player_id
          AND pgp.season_id = e.season_id
          AND pgp.game_date >= COALESCE(e.effective_from, '0001-01-01'::date)
    WHERE e.season_id = p_season_id
    GROUP BY e.id
  ), ranked AS (
    SELECT entry_id, pts, gc, RANK() OVER (ORDER BY pts DESC) AS rnk
    FROM per_entry
  )
  INSERT INTO public.pool_standings (season_id, entry_id, fantasy_points, rank, games_counted, computed_at)
  SELECT p_season_id, entry_id, pts, rnk, gc, NOW() FROM ranked
  ON CONFLICT (season_id, entry_id) DO UPDATE
    SET fantasy_points = EXCLUDED.fantasy_points,
        rank           = EXCLUDED.rank,
        games_counted  = EXCLUDED.games_counted,
        computed_at    = EXCLUDED.computed_at;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- RLS
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.pool_seasons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_scoring_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_player_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_roster_slots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_standings     ENABLE ROW LEVEL SECURITY;

-- Public reference data.
CREATE POLICY pool_seasons_read   ON public.pool_seasons       FOR SELECT USING (true);
CREATE POLICY pool_rules_read     ON public.pool_scoring_rules FOR SELECT USING (true);
CREATE POLICY pool_prices_read    ON public.pool_player_prices FOR SELECT USING (true);
CREATE POLICY pool_standings_read ON public.pool_standings     FOR SELECT USING (true);

-- Entries are public (the standings show who's playing + team name + spend).
CREATE POLICY pool_entries_read ON public.pool_entries FOR SELECT USING (true);

-- A member manages only their own entry, and only before it locks.
CREATE POLICY pool_entries_insert ON public.pool_entries FOR INSERT
  WITH CHECK (member_id = auth.uid());
CREATE POLICY pool_entries_update ON public.pool_entries FOR UPDATE
  USING (member_id = auth.uid() AND is_locked = false)
  WITH CHECK (member_id = auth.uid());

-- Rosters: visible to the owner always; to everyone only AFTER lock
-- (anti-copying before the season starts).
CREATE POLICY pool_roster_read ON public.pool_roster_slots FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.pool_entries e
    JOIN public.pool_seasons s ON s.id = e.season_id
    WHERE e.id = pool_roster_slots.entry_id
      AND ( e.member_id = auth.uid()
         OR e.is_locked = true
         OR (s.lock_at IS NOT NULL AND NOW() >= s.lock_at) )
  )
);

-- Roster writes: owner only, before lock (the slot trigger re-checks too).
CREATE POLICY pool_roster_write ON public.pool_roster_slots FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.pool_entries e
    WHERE e.id = pool_roster_slots.entry_id
      AND e.member_id = auth.uid() AND e.is_locked = false))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.pool_entries e
    WHERE e.id = pool_roster_slots.entry_id
      AND e.member_id = auth.uid() AND e.is_locked = false));

-- Prices, rules, standings and the lock flag are written only by the service
-- role (cron / admin), which bypasses RLS — so no client write policy exists.
