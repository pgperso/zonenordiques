-- Pool LNH — richer standings: points on the last slate + rank movement.
--
-- Adds three materialized fields to pool_standings, filled by the nightly
-- refresh: points earned on the most recent finalized slate ("hier"), the
-- date of that slate, and the entry's rank BEFORE this refresh (to show
-- ▲/▼ movement). Total points and games_counted already exist.

ALTER TABLE public.pool_standings
  ADD COLUMN IF NOT EXISTS points_last_day NUMERIC(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_day DATE,
  ADD COLUMN IF NOT EXISTS previous_rank INT;

CREATE OR REPLACE FUNCTION public.pool_refresh_standings(p_season_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_last_day DATE;
BEGIN
  IF NOT pg_try_advisory_xact_lock(p_season_id) THEN RETURN; END IF;

  -- Most recent finalized in-scope slate for this season.
  SELECT MAX(game_date) INTO v_last_day
  FROM public.pool_player_game_points WHERE pool_season_id = p_season_id;

  WITH per_entry AS (
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
  ), ranked AS (
    SELECT entry_id, pts, gc, last_pts,
           RANK() OVER (ORDER BY pts DESC, gc ASC) AS rnk
    FROM per_entry
  )
  INSERT INTO public.pool_standings
    (season_id, entry_id, fantasy_points, rank, games_counted, points_last_day, last_day, computed_at)
  SELECT p_season_id, entry_id, pts, rnk, gc, last_pts, v_last_day, NOW() FROM ranked
  ON CONFLICT (season_id, entry_id) DO UPDATE
    SET previous_rank   = public.pool_standings.rank,   -- the rank before this refresh
        fantasy_points  = EXCLUDED.fantasy_points,
        rank            = EXCLUDED.rank,
        games_counted   = EXCLUDED.games_counted,
        points_last_day = EXCLUDED.points_last_day,
        last_day        = EXCLUDED.last_day,
        computed_at     = EXCLUDED.computed_at;
END $$;
