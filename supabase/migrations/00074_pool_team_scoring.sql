-- Pool LNH — team (NHL) scoring.
--
-- Each game night, the entry's chosen NHL team earns:
--   team_base_points  +  goals_for * team_gf_coef  +  goals_against * team_ga_coef
-- Defaults (the chosen rule): base 5, +0 per goal for, −1 per goal against.
-- All three are admin-configurable per season. These team points are ADDED to
-- the entry's player fantasy points in the standings.

ALTER TABLE public.pool_seasons
  ADD COLUMN IF NOT EXISTS team_base_points NUMERIC(8,2) NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS team_gf_coef NUMERIC(8,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS team_ga_coef NUMERIC(8,3) NOT NULL DEFAULT -1;

-- Per-team, per-game points. Each game contributes two rows (home + away).
CREATE OR REPLACE VIEW public.pool_team_game_points AS
SELECT
  ps.id AS pool_season_id,
  g.game_date,
  s.abbrev AS team_abbrev,
  ps.team_base_points + COALESCE(s.gf, 0) * ps.team_gf_coef + COALESCE(s.ga, 0) * ps.team_ga_coef AS pts
FROM public.nhl_games g
JOIN public.pool_seasons ps ON ps.nhl_season = g.season
  AND g.game_type = ANY (ps.game_types) AND g.game_state IN ('OFF', 'FINAL')
CROSS JOIN LATERAL (VALUES
  (g.home_abbrev, g.home_score, g.away_score),
  (g.away_abbrev, g.away_score, g.home_score)
) AS s(abbrev, gf, ga);

GRANT SELECT ON public.pool_team_game_points TO anon, authenticated;

-- Standings refresh now adds the chosen team's points to each entry.
CREATE OR REPLACE FUNCTION public.pool_refresh_standings(p_season_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_last_day DATE;
BEGIN
  IF NOT pg_try_advisory_xact_lock(p_season_id) THEN RETURN; END IF;

  SELECT MAX(game_date) INTO v_last_day
  FROM public.pool_player_game_points WHERE pool_season_id = p_season_id;

  WITH player_pts AS (
    SELECT e.id AS entry_id,
           COALESCE(SUM(pgp.pts), 0) AS pts,
           COUNT(pgp.game_id)        AS gc,
           COALESCE(SUM(pgp.pts) FILTER (WHERE pgp.game_date = v_last_day), 0) AS last_pts
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
