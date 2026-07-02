-- NHL data foundation for the hockey pool ("pool LNH").
--
-- This migration creates the *raw data* layer that mirrors the public NHL
-- API (api-web.nhle.com). It is intentionally independent of the pool
-- itself (migration 00055): the pool engine reads from these tables, but
-- these tables know nothing about pools. That separation lets us re-sync
-- NHL stats without touching pool state, and lets future features (live
-- scores, standings widgets, player pages) reuse the same data.
--
-- Population is done by the /api/cron/nhl-sync job, never by clients, so
-- RLS is read-only-public + service-role-write (the cron uses the service
-- role key, which bypasses RLS). Field names mirror the API responses
-- (see nhlService.ts) so the mapping stays obvious.
--
-- Season format is the NHL's 8-digit YYYYYYYY (e.g. 20252026). Game type:
-- 1 = preseason, 2 = regular season, 3 = playoffs.

-- 1. Teams -----------------------------------------------------------------
-- 32 NHL clubs, keyed by their 3-letter tricode (MTL, TOR, …) which the API
-- uses everywhere as the stable join key. Populated from /v1/standings/now.

CREATE TABLE IF NOT EXISTS public.nhl_teams (
  abbrev        TEXT PRIMARY KEY,                  -- 'MTL'
  team_id       INT UNIQUE,                        -- numeric NHL id (e.g. 8)
  name          TEXT NOT NULL,                     -- 'Canadiens'
  place_name    TEXT,                              -- 'Montréal'
  full_name     TEXT,                              -- 'Montréal Canadiens'
  conference    TEXT,
  division      TEXT,
  logo_url      TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Players ---------------------------------------------------------------
-- Keyed by the NHL player id. Populated from team rosters
-- (/v1/roster/{team}/current) before a season's draft opens, and refreshed
-- as boxscores surface players we haven't seen yet.

CREATE TABLE IF NOT EXISTS public.nhl_players (
  player_id      BIGINT PRIMARY KEY,
  first_name     TEXT,
  last_name      TEXT,
  full_name      TEXT NOT NULL,
  position       TEXT NOT NULL CHECK (position IN ('C', 'L', 'R', 'D', 'G')),
  team_abbrev    TEXT REFERENCES public.nhl_teams(abbrev) ON DELETE SET NULL,
  sweater_number INT,
  shoots_catches TEXT,                             -- 'L' / 'R'
  headshot_url   TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nhl_players_team ON public.nhl_players(team_abbrev);
CREATE INDEX IF NOT EXISTS idx_nhl_players_position ON public.nhl_players(position);

-- 3. Games -----------------------------------------------------------------
-- One row per scheduled game. game_state tracks lifecycle:
--   FUT/PRE  → not started     LIVE/CRIT → in progress
--   OFF/FINAL → final          (we only score stats once state is final)

CREATE TABLE IF NOT EXISTS public.nhl_games (
  game_id        BIGINT PRIMARY KEY,               -- e.g. 2025020001
  season         INT NOT NULL,                     -- 20252026
  game_type      SMALLINT NOT NULL,                -- 1/2/3
  game_date      DATE NOT NULL,
  start_time_utc TIMESTAMPTZ,
  away_abbrev    TEXT NOT NULL,
  home_abbrev    TEXT NOT NULL,
  away_score     INT,
  home_score     INT,
  game_state     TEXT NOT NULL DEFAULT 'FUT',
  last_synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_nhl_games_season_date ON public.nhl_games(season, game_date);
CREATE INDEX IF NOT EXISTS idx_nhl_games_state ON public.nhl_games(game_state);

-- 4. Per-player, per-game stats -------------------------------------------
-- The atomic unit the pool scores against. One row per (game, player).
-- Skater columns and goalie columns coexist; the relevant set is filled
-- based on `position`. Storing per-game (not per-season totals) means we
-- can recompute pool scoring with any rule set, and re-sync a single game
-- idempotently via the UNIQUE(game_id, player_id) upsert key.

CREATE TABLE IF NOT EXISTS public.nhl_player_game_stats (
  id              BIGSERIAL PRIMARY KEY,
  game_id         BIGINT NOT NULL REFERENCES public.nhl_games(game_id) ON DELETE CASCADE,
  player_id       BIGINT NOT NULL REFERENCES public.nhl_players(player_id) ON DELETE CASCADE,
  team_abbrev     TEXT NOT NULL,
  position        TEXT NOT NULL,

  -- Skater stats
  goals           INT NOT NULL DEFAULT 0,
  assists         INT NOT NULL DEFAULT 0,
  points          INT NOT NULL DEFAULT 0,
  plus_minus      INT NOT NULL DEFAULT 0,
  pim             INT NOT NULL DEFAULT 0,
  shots           INT NOT NULL DEFAULT 0,           -- sog
  powerplay_goals INT NOT NULL DEFAULT 0,
  hits            INT NOT NULL DEFAULT 0,
  blocked_shots   INT NOT NULL DEFAULT 0,

  -- Goalie stats
  decision        TEXT,                             -- 'W' / 'L' / 'O' (OT loss), null if no decision
  shots_against   INT,
  saves           INT,
  goals_against   INT,
  shutout         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Shared
  toi_seconds     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (game_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_nhl_pgs_player ON public.nhl_player_game_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_nhl_pgs_game ON public.nhl_player_game_stats(game_id);

-- 5. Sync run log ----------------------------------------------------------
-- Observability for the cron: each run records what date(s) it covered,
-- how many games it processed, and any error. Lets us detect a silently
-- failing sync (e.g. API shape change) instead of discovering it via wrong
-- pool standings.

CREATE TABLE IF NOT EXISTS public.nhl_sync_runs (
  id               BIGSERIAL PRIMARY KEY,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,
  target_date      DATE,
  games_seen       INT NOT NULL DEFAULT 0,
  games_finalized  INT NOT NULL DEFAULT 0,
  stat_rows        INT NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'running'  -- 'running' / 'ok' / 'error'
                     CHECK (status IN ('running', 'ok', 'error')),
  error            TEXT
);

CREATE INDEX IF NOT EXISTS idx_nhl_sync_runs_started ON public.nhl_sync_runs(started_at DESC);

-- 6. RLS -------------------------------------------------------------------
-- All NHL data is public reference data: anyone (even logged-out) can read
-- it. No client may write — only the cron, which uses the service role key
-- and bypasses RLS entirely.

ALTER TABLE public.nhl_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhl_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhl_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhl_player_game_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nhl_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "NHL teams are public" ON public.nhl_teams;
CREATE POLICY "NHL teams are public" ON public.nhl_teams FOR SELECT USING (true);

DROP POLICY IF EXISTS "NHL players are public" ON public.nhl_players;
CREATE POLICY "NHL players are public" ON public.nhl_players FOR SELECT USING (true);

DROP POLICY IF EXISTS "NHL games are public" ON public.nhl_games;
CREATE POLICY "NHL games are public" ON public.nhl_games FOR SELECT USING (true);

DROP POLICY IF EXISTS "NHL player stats are public" ON public.nhl_player_game_stats;
CREATE POLICY "NHL player stats are public" ON public.nhl_player_game_stats FOR SELECT USING (true);

-- Sync runs are operational data — not exposed to clients (no SELECT policy
-- means no anon/auth read; the service role still sees everything).
