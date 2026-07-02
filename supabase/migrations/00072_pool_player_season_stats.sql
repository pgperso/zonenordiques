-- Pool LNH — per-player season stat totals (for the lineup/team stat tables).
--
-- Aggregates nhl_player_game_stats to season totals per player (in-scope
-- finalized games of each pool season), and computes the player's fantasy
-- points from the season's barème. Fantasy points are linear in the stats,
-- so applying the coefficients to the season totals equals summing per game.
-- Read-only reference data → granted to anon/authenticated (underlying tables
-- are all public-read).

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
  + t.wins * COALESCE(rk.win, 0) + t.losses * COALESCE(rk.loss, 0) + t.ot_losses * COALESCE(rk.ot_loss, 0)
  + t.shutouts * COALESCE(rk.shutout, 0) + t.saves * COALESCE(rk.save, 0)
  + t.goals_against * COALESCE(rk.goal_against, 0)
  AS fantasy_points
FROM (
  SELECT
    ps.id AS pool_season_id, s.player_id,
    COUNT(*) AS gp,
    SUM(s.goals) AS goals, SUM(s.assists) AS assists, SUM(s.points) AS points,
    SUM(s.plus_minus) AS plus_minus, SUM(s.pim) AS pim, SUM(s.shots) AS shots,
    SUM(s.powerplay_goals) AS pp_goals, SUM(s.hits) AS hits, SUM(s.blocked_shots) AS blocked_shots,
    SUM(s.takeaways) AS takeaways, SUM(s.giveaways) AS giveaways, SUM(s.toi_seconds) AS toi_seconds,
    COUNT(*) FILTER (WHERE s.decision = 'W') AS wins,
    COUNT(*) FILTER (WHERE s.decision = 'L') AS losses,
    COUNT(*) FILTER (WHERE s.decision = 'O') AS ot_losses,
    COUNT(*) FILTER (WHERE s.shutout) AS shutouts,
    SUM(s.saves) AS saves, SUM(s.shots_against) AS shots_against, SUM(s.goals_against) AS goals_against
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
    MAX(coefficient) FILTER (WHERE stat_key='win') AS win,
    MAX(coefficient) FILTER (WHERE stat_key='loss') AS loss,
    MAX(coefficient) FILTER (WHERE stat_key='ot_loss') AS ot_loss,
    MAX(coefficient) FILTER (WHERE stat_key='shutout') AS shutout,
    MAX(coefficient) FILTER (WHERE stat_key='save') AS save,
    MAX(coefficient) FILTER (WHERE stat_key='goal_against') AS goal_against
  FROM public.pool_scoring_rules WHERE season_id = t.pool_season_id
) rk ON TRUE;

GRANT SELECT ON public.pool_player_season_stats TO anon, authenticated;
