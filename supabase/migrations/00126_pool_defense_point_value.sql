-- Pool LNH — a defenceman's points are worth more.
--
-- Owner's rule: for a defenceman, each real point (goal or assist) is worth
-- 1.5, replacing the skater barème's goal ×2 / assist ×1. Everything else in
-- the barème — hat trick, penalty minutes, shots — applies unchanged, and the
-- star multiplier doubles the lot.
--
-- Worked from the owner's own example: 3 goals and 2 assists for a star
-- defenceman is (3+2) × 1.5 × 2 = 15, plus the hat trick at 1 × 2 = 2, so 17.
--
-- Configurable rather than hard-coded, like every other rule in this pool:
-- defense_point_value = 0 means "no special rule, score defencemen like any
-- skater", which is the behaviour every season had until now. Existing
-- seasons are set to 1.5 explicitly, so nothing changes by accident.
--
-- Idempotent.

ALTER TABLE public.pool_seasons
  ADD COLUMN IF NOT EXISTS defense_point_value NUMERIC(8,3) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pool_seasons.defense_point_value IS
  'Pool points per real point (goal or assist) for a defenceman, replacing the goals/assists barème for them. 0 = off, score them like any skater.';

ALTER TABLE public.pool_seasons DROP CONSTRAINT IF EXISTS pool_seasons_defense_point_value_ck;
ALTER TABLE public.pool_seasons
  ADD CONSTRAINT pool_seasons_defense_point_value_ck CHECK (defense_point_value >= 0);

UPDATE public.pool_seasons SET defense_point_value = 1.5 WHERE defense_point_value = 0;

-- ── Per-game points ──────────────────────────────────────────────────────
-- The 00119 body, with the defenceman branch. s.position is the position the
-- player dressed at in that game, so the rule follows the player rather than
-- a season-long label.
DROP VIEW IF EXISTS public.pool_player_game_points;
CREATE VIEW public.pool_player_game_points AS
SELECT
  ps.id AS pool_season_id, s.game_id, s.player_id, g.game_date,
    CASE
      WHEN s.position = 'D' AND ps.defense_point_value > 0
        THEN (COALESCE(s.goals, 0) + COALESCE(s.assists, 0)) * ps.defense_point_value
      ELSE COALESCE(s.goals, 0) * COALESCE(rk.goals, 0)
         + COALESCE(s.assists, 0) * COALESCE(rk.assists, 0)
    END
  + COALESCE(s.plus_minus, 0)     * COALESCE(rk.plus_minus, 0)
  + COALESCE(s.pim, 0)            * COALESCE(rk.pim, 0)
  + COALESCE(s.shots, 0)          * COALESCE(rk.shots, 0)
  + COALESCE(s.powerplay_goals, 0)* COALESCE(rk.pp_goals, 0)
  + COALESCE(s.hits, 0)           * COALESCE(rk.hits, 0)
  + COALESCE(s.blocked_shots, 0)  * COALESCE(rk.blocked_shots, 0)
  + COALESCE(s.takeaways, 0)      * COALESCE(rk.takeaways, 0)
  + COALESCE(s.giveaways, 0)      * COALESCE(rk.giveaways, 0)
  + (CASE WHEN COALESCE(s.goals, 0) >= 3 THEN 1 ELSE 0 END) * COALESCE(rk.hat_trick, 0)
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

-- ── Season totals ────────────────────────────────────────────────────────
-- Same rule, same source for the position: whatever the player dressed at.
CREATE OR REPLACE VIEW public.pool_player_season_stats AS
SELECT
  t.pool_season_id, t.player_id, t.gp,
  t.goals, t.assists, t.points, t.plus_minus, t.pim, t.shots, t.pp_goals,
  t.hits, t.blocked_shots, t.takeaways, t.giveaways, t.toi_seconds,
  t.wins, t.losses, t.ot_losses, t.shutouts, t.saves, t.shots_against, t.goals_against,
    CASE
      WHEN t.pos = 'D' AND sn.defense_point_value > 0
        THEN (t.goals + t.assists) * sn.defense_point_value
      ELSE t.goals * COALESCE(rk.goals, 0) + t.assists * COALESCE(rk.assists, 0)
    END
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
    MAX(s.position) AS pos,
    COUNT(*) AS gp,
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
JOIN public.pool_seasons sn ON sn.id = t.pool_season_id
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

-- Points changed for every defenceman, so the stored standings are stale.
SELECT public.pool_refresh_standings(id) FROM public.pool_seasons;

-- ── Verification ──────────────────────────────────────────────────────────
-- The owner's example: a defenceman with 3 goals and 2 assists should show
-- (3+2) × 1.5 = 7.5 here, and 17 on a star's roster once the hat trick (1)
-- and the ×2 are applied by the roster table.
--   SELECT np.full_name, st.goals, st.assists, st.fantasy_points
--   FROM public.pool_player_season_stats st
--   JOIN public.nhl_players np ON np.player_id = st.player_id
--   WHERE st.pool_season_id = 1 AND np.position = 'D' AND st.points > 0
--   ORDER BY st.fantasy_points DESC LIMIT 10;
