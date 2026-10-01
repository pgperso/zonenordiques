-- Pool LNH — a skater's season fantasy points came out as zero.
--
-- pool_player_season_stats guarded the COEFFICIENT against NULL but not the
-- STAT:
--
--   t.saves * COALESCE(rk.save, 0)
--
-- A skater has no saves, so t.saves is NULL, and NULL * 0 is NULL — which
-- poisons the whole sum, because 2 + NULL is NULL. Every skater's
-- fantasy_points was therefore NULL, shown as 0 in "Mon équipe": Connor
-- McDavid with two assists and a barème paying 1 per assist displayed 0.
--
-- The per-game view got this right (COALESCE(s.saves, 0) * COALESCE(rk.save,
-- 0)), which is why the standings were correct while the roster table was
-- not — the same points, computed two ways, disagreeing in silence.
--
-- Fixed at the source: the inner aggregate now returns 0 instead of NULL, so
-- both the displayed stat columns and the sum are safe whichever way a future
-- caller reads them.
--
-- Also adds the hat-trick bonus (00116), which this view never learned about:
-- it cannot be summed from season totals — 3 goals over three games is not a
-- hat trick — so it is counted per game and added in.
--
-- Idempotent.

CREATE OR REPLACE VIEW public.pool_player_season_stats AS
SELECT
  t.pool_season_id, t.player_id, t.gp,
  t.goals, t.assists, t.points, t.plus_minus, t.pim, t.shots, t.pp_goals,
  t.hits, t.blocked_shots, t.takeaways, t.giveaways, t.toi_seconds,
  t.wins, t.losses, t.ot_losses, t.shutouts, t.saves, t.shots_against, t.goals_against,
    t.goals * COALESCE(rk.goals, 0) + t.assists * COALESCE(rk.assists, 0)
  + t.plus_minus * COALESCE(rk.plus_minus, 0) + t.pim * COALESCE(rk.pim, 0)
  + t.shots * COALESCE(rk.shots, 0) + t.pp_goals * COALESCE(rk.pp_goals, 0)
  + t.hits * COALESCE(rk.hits, 0) + t.blocked_shots * COALESCE(rk.blocked_shots, 0)
  + t.takeaways * COALESCE(rk.takeaways, 0) + t.giveaways * COALESCE(rk.giveaways, 0)
  + t.hat_tricks * COALESCE(rk.hat_trick, 0)
  + t.wins * COALESCE(rk.win, 0) + t.losses * COALESCE(rk.loss, 0) + t.ot_losses * COALESCE(rk.ot_loss, 0)
  + t.shutouts * COALESCE(rk.shutout, 0) + t.saves * COALESCE(rk.save, 0)
  + t.goals_against * COALESCE(rk.goal_against, 0)
  AS fantasy_points
FROM (
  SELECT
    ps.id AS pool_season_id, s.player_id,
    COUNT(*) AS gp,
    -- Every total is COALESCEd: a skater has no saves and a goalie no hits,
    -- and one NULL term turns the whole fantasy sum into NULL.
    COALESCE(SUM(s.goals), 0) AS goals,
    COALESCE(SUM(s.assists), 0) AS assists,
    COALESCE(SUM(s.points), 0) AS points,
    COALESCE(SUM(s.plus_minus), 0) AS plus_minus,
    COALESCE(SUM(s.pim), 0) AS pim,
    COALESCE(SUM(s.shots), 0) AS shots,
    COALESCE(SUM(s.powerplay_goals), 0) AS pp_goals,
    COALESCE(SUM(s.hits), 0) AS hits,
    COALESCE(SUM(s.blocked_shots), 0) AS blocked_shots,
    COALESCE(SUM(s.takeaways), 0) AS takeaways,
    COALESCE(SUM(s.giveaways), 0) AS giveaways,
    COALESCE(SUM(s.toi_seconds), 0) AS toi_seconds,
    -- Counted per game: three goals spread over three nights is not a hat
    -- trick, so this cannot be derived from the season total.
    COUNT(*) FILTER (WHERE s.goals >= 3) AS hat_tricks,
    COUNT(*) FILTER (WHERE s.decision = 'W') AS wins,
    COUNT(*) FILTER (WHERE s.decision = 'L') AS losses,
    COUNT(*) FILTER (WHERE s.decision = 'O') AS ot_losses,
    COUNT(*) FILTER (WHERE s.shutout) AS shutouts,
    COALESCE(SUM(s.saves), 0) AS saves,
    COALESCE(SUM(s.shots_against), 0) AS shots_against,
    COALESCE(SUM(s.goals_against), 0) AS goals_against
  FROM public.nhl_player_game_stats s
  JOIN public.nhl_games g ON g.game_id = s.game_id
  JOIN public.pool_seasons ps ON ps.nhl_season = g.season
    AND g.game_type = ANY (ps.game_types) AND g.game_state IN ('OFF', 'FINAL')
  GROUP BY ps.id, s.player_id
) t
LEFT JOIN LATERAL (
  SELECT
    MAX(coefficient) FILTER (WHERE stat_key='goals') AS goals,
    MAX(coefficient) FILTER (WHERE stat_key='assists') AS assists,
    MAX(coefficient) FILTER (WHERE stat_key='plus_minus') AS plus_minus,
    MAX(coefficient) FILTER (WHERE stat_key='pim') AS pim,
    MAX(coefficient) FILTER (WHERE stat_key='shots') AS shots,
    MAX(coefficient) FILTER (WHERE stat_key='pp_goals') AS pp_goals,
    MAX(coefficient) FILTER (WHERE stat_key='hits') AS hits,
    MAX(coefficient) FILTER (WHERE stat_key='blocked_shots') AS blocked_shots,
    MAX(coefficient) FILTER (WHERE stat_key='takeaways') AS takeaways,
    MAX(coefficient) FILTER (WHERE stat_key='giveaways') AS giveaways,
    MAX(coefficient) FILTER (WHERE stat_key='hat_trick') AS hat_trick,
    MAX(coefficient) FILTER (WHERE stat_key='win') AS win,
    MAX(coefficient) FILTER (WHERE stat_key='loss') AS loss,
    MAX(coefficient) FILTER (WHERE stat_key='ot_loss') AS ot_loss,
    MAX(coefficient) FILTER (WHERE stat_key='shutout') AS shutout,
    MAX(coefficient) FILTER (WHERE stat_key='save') AS save,
    MAX(coefficient) FILTER (WHERE stat_key='goal_against') AS goal_against
  FROM public.pool_scoring_rules WHERE season_id = t.pool_season_id
) rk ON TRUE;

GRANT SELECT ON public.pool_player_season_stats TO anon, authenticated;

-- ── Verification ──────────────────────────────────────────────────────────
-- Expect a non-zero fantasy_points wherever a skater has goals or assists:
--   SELECT np.full_name, st.gp, st.goals, st.assists, st.fantasy_points
--   FROM public.pool_player_season_stats st
--   JOIN public.nhl_players np ON np.player_id = st.player_id
--   WHERE st.pool_season_id = 1 AND (st.goals > 0 OR st.assists > 0)
--   ORDER BY st.fantasy_points DESC
--   LIMIT 15;
--
-- Expect 0 rows — nobody with production and no points:
--   SELECT COUNT(*) FROM public.pool_player_season_stats
--   WHERE pool_season_id = 1 AND (goals > 0 OR assists > 0) AND fantasy_points = 0;
