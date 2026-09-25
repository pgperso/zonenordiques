-- Pool LNH — two new bonuses in the barème.
--
--  1. TOUR DU CHAPEAU (player): a bonus when a skater scores 3 or more goals
--     in one game. One bonus per game, not one per goal past two — a four-goal
--     night is still one hat trick, which is how the term is used.
--
--  2. JEU BLANC (team): a bonus when the entry's chosen NHL club allows zero
--     goals. Separate from the goalie's own `shutout` stat, which rewards the
--     goalie a member drafted; this rewards the club a member picked.
--
--     "Allowed zero" is read off the final score, which matches the NHL's own
--     convention in a shootout: the winner's decisive shootout goal is added
--     to its score, so the team that lost 1-0 in a shootout still shows 0 goals
--     for, and its opponent — the team the NHL credits with the shutout — is
--     the one that gets the bonus here.
--
-- Both default to 0, so running this migration changes nobody's points until
-- the values are set in the admin.
--
-- Idempotent.

-- ── 1. Allow the new stat key ─────────────────────────────────────────────
ALTER TABLE public.pool_scoring_rules DROP CONSTRAINT IF EXISTS pool_scoring_rules_stat_key_check;
ALTER TABLE public.pool_scoring_rules ADD CONSTRAINT pool_scoring_rules_stat_key_check
  CHECK (stat_key IN (
    -- skater
    'goals','assists','plus_minus','pim','shots','pp_goals','hits','blocked_shots','takeaways','giveaways',
    'hat_trick',
    -- goalie
    'win','loss','ot_loss','shutout','save','goal_against'
  ));

-- ── 2. Team shutout bonus, per season ─────────────────────────────────────
ALTER TABLE public.pool_seasons
  ADD COLUMN IF NOT EXISTS team_shutout_points NUMERIC(8,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pool_seasons.team_shutout_points IS
  'Bonus added to the chosen club''s nightly points when it allows zero goals. 0 = off.';

-- ── 3. Player points: add the hat-trick term ──────────────────────────────
-- The 00068 body, with one term added. A skater with 3+ goals earns the
-- coefficient once; COALESCE keeps seasons that never configured the rule at
-- exactly the points they had.
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

-- ── 4. Team points: add the shutout bonus ─────────────────────────────────
-- The 00074 body, with one term added.
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
  AND g.game_type = ANY (ps.game_types) AND g.game_state IN ('OFF', 'FINAL')
CROSS JOIN LATERAL (VALUES
  (g.home_abbrev, g.home_score, g.away_score),
  (g.away_abbrev, g.away_score, g.home_score)
) AS s(abbrev, gf, ga);

GRANT SELECT ON public.pool_team_game_points TO anon, authenticated;

-- ── Verification ──────────────────────────────────────────────────────────
-- A) The key is accepted:
--      INSERT INTO public.pool_scoring_rules (season_id, stat_key, applies_to, coefficient)
--      VALUES (1, 'hat_trick', 'skater', 2)
--      ON CONFLICT (season_id, stat_key) DO UPDATE SET coefficient = EXCLUDED.coefficient;
--    (Or set it from the admin page, which is the intended way.)
--
-- B) Once games exist, hat tricks and the points they earned:
--      SELECT np.full_name, g.game_date, s.goals, pgp.pts
--      FROM public.nhl_player_game_stats s
--      JOIN public.nhl_games g ON g.game_id = s.game_id
--      JOIN public.nhl_players np ON np.player_id = s.player_id
--      JOIN public.pool_player_game_points pgp
--        ON pgp.game_id = s.game_id AND pgp.player_id = s.player_id AND pgp.pool_season_id = 1
--      WHERE s.goals >= 3 ORDER BY g.game_date DESC;
--
-- C) Nights a club was shut out of goals against:
--      SELECT team_abbrev, game_date, pts FROM public.pool_team_game_points
--      WHERE pool_season_id = 1 ORDER BY pts DESC LIMIT 20;
--
-- After changing any coefficient, re-run the standings:
--      SELECT public.pool_refresh_standings(1);
