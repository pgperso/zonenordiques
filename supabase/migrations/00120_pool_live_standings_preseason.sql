-- Pool LNH — show the leaderboard before the season, everyone on zero.
--
-- 00119 returned nothing when no game had been played, so the chat banner had
-- nothing to display for the weeks that matter most for recruiting. A board
-- where every team sits at 0 is not empty: it shows who is in, it makes the
-- pool feel real, and it gives a member a reason to add their name to it.
--
-- Same body as 00119 minus the early return: with v_day NULL, no game row can
-- match `game_date = v_day`, so every LEFT JOIN falls through to 0 on its own.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.pool_live_standings(p_season_id BIGINT)
RETURNS TABLE (
  entry_id      BIGINT,
  team_name     TEXT,
  team_logo     TEXT,
  member_id     UUID,
  points_today  NUMERIC,
  rank_today    INT,
  points_total  NUMERIC,
  rank_total    INT,
  game_day      DATE,
  games_live    INT,
  games_total   INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_season  public.pool_seasons%ROWTYPE;
  v_day     DATE;
  v_stars   BOOLEAN;
  v_live    INT;
  v_all     INT;
BEGIN
  SELECT * INTO v_season FROM public.pool_seasons WHERE id = p_season_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_stars := v_season.stars_enabled;

  -- NULL before the first game. Everything below tolerates that.
  SELECT MAX(g.game_date) INTO v_day
  FROM public.nhl_games g
  WHERE g.season = v_season.nhl_season
    AND g.game_type = ANY (v_season.game_types)
    AND g.game_state IN ('OFF', 'FINAL', 'LIVE', 'CRIT')
    AND g.game_date <= (NOW() AT TIME ZONE v_season.timezone)::date;

  SELECT COUNT(*) FILTER (WHERE g.game_state IN ('LIVE', 'CRIT')), COUNT(*)
    INTO v_live, v_all
  FROM public.nhl_games g
  WHERE g.season = v_season.nhl_season
    AND g.game_type = ANY (v_season.game_types)
    AND v_day IS NOT NULL
    AND g.game_date = v_day;

  RETURN QUERY
  WITH day_player AS (
    SELECT e.id AS eid,
           COALESCE(SUM(pgp.pts * CASE WHEN v_stars AND rs.player_id IN (e.star_forward_id, e.star_defense_id) THEN 2 ELSE 1 END), 0) AS pts
    FROM public.pool_entries e
    LEFT JOIN public.pool_roster_slots rs ON rs.entry_id = e.id
    LEFT JOIN public.pool_player_game_points pgp
           ON pgp.player_id = rs.player_id
          AND pgp.pool_season_id = e.season_id
          AND pgp.game_date = v_day
          AND pgp.game_date >= GREATEST(rs.effective_from, COALESCE(e.effective_from, '0001-01-01'::date))
          AND (rs.effective_to IS NULL OR pgp.game_date < rs.effective_to)
    WHERE e.season_id = p_season_id AND e.is_confirmed
    GROUP BY e.id
  ), day_team AS (
    SELECT e.id AS eid, COALESCE(SUM(tgp.pts), 0) AS pts
    FROM public.pool_entries e
    LEFT JOIN public.pool_team_game_points tgp
           ON tgp.pool_season_id = e.season_id
          AND tgp.team_abbrev = e.team_pick
          AND tgp.game_date = v_day
    WHERE e.season_id = p_season_id AND e.is_confirmed
    GROUP BY e.id
  ), day_total AS (
    SELECT dp.eid, dp.pts + COALESCE(dt.pts, 0) AS pts
    FROM day_player dp LEFT JOIN day_team dt ON dt.eid = dp.eid
  )
  SELECT e.id,
         e.team_name,
         e.team_logo,
         e.member_id,
         d.pts,
         RANK() OVER (ORDER BY d.pts DESC)::INT,
         COALESCE(st.fantasy_points, 0),
         COALESCE(st.rank, 0),
         v_day,
         COALESCE(v_live, 0),
         COALESCE(v_all, 0)
  FROM day_total d
  JOIN public.pool_entries e ON e.id = d.eid
  LEFT JOIN public.pool_standings st ON st.entry_id = e.id AND st.season_id = p_season_id
  ORDER BY d.pts DESC, e.team_name ASC;
END $$;

GRANT EXECUTE ON FUNCTION public.pool_live_standings(BIGINT) TO anon, authenticated;

-- ── Verification ──────────────────────────────────────────────────────────
-- Expect one row per CONFIRMED entry, all at 0 until the season starts:
--   SELECT team_name, points_today, rank_today, game_day
--   FROM public.pool_live_standings(1);
