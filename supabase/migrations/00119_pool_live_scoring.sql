-- Pool LNH — score games while they are being played.
--
-- Until now the pool only counted games whose state was OFF or FINAL, and the
-- roster/boxscore sync ran once a night. So a member watching a Tuesday game
-- saw nothing move until Wednesday morning. This makes the points follow the
-- games, which is what the chat banner needs.
--
-- Three changes:
--
--  1. The scoring views accept LIVE and CRIT. A boxscore for a game in
--     progress is partial by definition — that is the point — and syncDate
--     replaces a game's stat rows wholesale on every pass, so a live game
--     converges on its final numbers without leaving anything stale behind.
--
--  2. pool_refresh_standings takes p_live. A live pass must NOT rotate
--     previous_rank: that column exists to show ▲/▼ against YESTERDAY, and
--     refreshing every couple of minutes would turn it into "two minutes ago"
--     and the arrows would go blank. Only the nightly pass rotates it.
--
--  3. pool_live_standings(season) returns tonight's slate: points earned on
--     the most recent game day, per entry, ranked — plus the season total, so
--     the banner can show both without a second query.
--
-- Idempotent.

-- ── 1. Player points, live games included ────────────────────────────────
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
  + (CASE WHEN s.goals >= 3 THEN 1 ELSE 0 END)     * COALESCE(rk.hat_trick, 0)
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
  AND g.game_state IN ('OFF', 'FINAL', 'LIVE', 'CRIT')
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
    MAX(coefficient) FILTER (WHERE stat_key='hat_trick')     AS hat_trick,
    MAX(coefficient) FILTER (WHERE stat_key='win')           AS win,
    MAX(coefficient) FILTER (WHERE stat_key='loss')          AS loss,
    MAX(coefficient) FILTER (WHERE stat_key='ot_loss')       AS ot_loss,
    MAX(coefficient) FILTER (WHERE stat_key='shutout')       AS shutout,
    MAX(coefficient) FILTER (WHERE stat_key='save')          AS save,
    MAX(coefficient) FILTER (WHERE stat_key='goal_against')  AS goal_against
  FROM public.pool_scoring_rules WHERE season_id = ps.id
) rk ON TRUE;

GRANT SELECT ON public.pool_player_game_points TO anon, authenticated;

-- ── 2. Team points, live games included ──────────────────────────────────
-- A club's bonus for allowing zero goals is provisional while the game is on:
-- it shows, and it disappears the moment the opponent scores. That is what a
-- live scoreboard is.
CREATE OR REPLACE VIEW public.pool_team_game_points AS
SELECT
  ps.id AS pool_season_id,
  g.game_date,
  s.abbrev AS team_abbrev,
  ps.team_base_points
    + COALESCE(s.gf, 0) * ps.team_gf_coef
    + COALESCE(s.ga, 0) * ps.team_ga_coef
    + CASE WHEN COALESCE(s.ga, 0) = 0 THEN ps.team_shutout_points ELSE 0 END AS pts
FROM public.nhl_games g
JOIN public.pool_seasons ps ON ps.nhl_season = g.season
  AND g.game_type = ANY (ps.game_types)
  AND g.game_state IN ('OFF', 'FINAL', 'LIVE', 'CRIT')
CROSS JOIN LATERAL (VALUES
  (g.home_abbrev, g.home_score, g.away_score),
  (g.away_abbrev, g.away_score, g.home_score)
) AS s(abbrev, gf, ga);

GRANT SELECT ON public.pool_team_game_points TO anon, authenticated;

-- ── 3. The standings refresh learns about live passes ────────────────────
-- Body as of 00077, with one behavioural change: previous_rank is only
-- rotated on a non-live pass.
CREATE OR REPLACE FUNCTION public.pool_refresh_standings(p_season_id BIGINT, p_live BOOLEAN DEFAULT FALSE)
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
    SET previous_rank   = CASE WHEN p_live THEN public.pool_standings.previous_rank
                               ELSE public.pool_standings.rank END,
        fantasy_points  = EXCLUDED.fantasy_points,
        rank            = EXCLUDED.rank,
        games_counted   = EXCLUDED.games_counted,
        points_last_day = EXCLUDED.points_last_day,
        last_day        = EXCLUDED.last_day,
        computed_at     = EXCLUDED.computed_at;
END $$;

REVOKE EXECUTE ON FUNCTION public.pool_refresh_standings(BIGINT, BOOLEAN) FROM anon, authenticated;

-- ── 4. Tonight's slate, ranked ───────────────────────────────────────────
-- "The most recent game day" rather than "today": after midnight the slate
-- that just finished is yesterday's, and that is still what a member wants to
-- see. Ranked on the day's points, with the season standing alongside.
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

  SELECT MAX(g.game_date) INTO v_day
  FROM public.nhl_games g
  WHERE g.season = v_season.nhl_season
    AND g.game_type = ANY (v_season.game_types)
    AND g.game_state IN ('OFF', 'FINAL', 'LIVE', 'CRIT')
    AND g.game_date <= (NOW() AT TIME ZONE v_season.timezone)::date;
  IF v_day IS NULL THEN RETURN; END IF;

  SELECT COUNT(*) FILTER (WHERE g.game_state IN ('LIVE', 'CRIT')), COUNT(*)
    INTO v_live, v_all
  FROM public.nhl_games g
  WHERE g.season = v_season.nhl_season
    AND g.game_type = ANY (v_season.game_types)
    AND g.game_date = v_day;

  RETURN QUERY
  WITH day_player AS (
    SELECT e.id AS eid,
           COALESCE(SUM(pgp.pts * CASE WHEN v_stars AND rs.player_id IN (e.star_forward_id, e.star_defense_id) THEN 2 ELSE 1 END), 0) AS pts
    FROM public.pool_entries e
    JOIN public.pool_roster_slots rs ON rs.entry_id = e.id
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
         v_live,
         v_all
  FROM day_total d
  JOIN public.pool_entries e ON e.id = d.eid
  LEFT JOIN public.pool_standings st ON st.entry_id = e.id AND st.season_id = p_season_id
  ORDER BY d.pts DESC, e.team_name ASC;
END $$;

GRANT EXECUTE ON FUNCTION public.pool_live_standings(BIGINT) TO anon, authenticated;

-- ── Verification ──────────────────────────────────────────────────────────
-- Tonight's slate (empty before the season starts, which is correct):
--   SELECT * FROM public.pool_live_standings(1);
--
-- Live games currently counted:
--   SELECT game_date, game_state, COUNT(*) FROM public.nhl_games
--   WHERE game_state IN ('LIVE','CRIT') GROUP BY 1,2;
