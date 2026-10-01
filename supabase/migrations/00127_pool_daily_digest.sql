-- Pool LNH — one night's facts, in a shape the bot can talk about.
--
-- The analyst bot must not be handed raw tables. A model given a spreadsheet
-- invents numbers that look plausible; a model given a short list of computed
-- facts comments on them. So everything it is allowed to say is decided here,
-- in SQL, against the real rows — the bot only chooses the words.
--
-- Returns NULL when the slate produced nothing, so the caller stays silent
-- rather than posting "nobody scored" every off night.
--
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.pool_bot_digests (
  season_id  BIGINT NOT NULL REFERENCES public.pool_seasons(id) ON DELETE CASCADE,
  game_day   DATE   NOT NULL,
  posted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (season_id, game_day)
);

COMMENT ON TABLE public.pool_bot_digests IS
  'One row per night the analyst bot has already covered. The cron can be re-run, and a stat correction can trigger a second sync, without the tribune getting the same analysis twice.';

ALTER TABLE public.pool_bot_digests ENABLE ROW LEVEL SECURITY;
-- Service-role only: nothing in the app reads or writes this.

CREATE OR REPLACE FUNCTION public.pool_daily_digest(p_season_id BIGINT, p_day DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_season public.pool_seasons%ROWTYPE;
  v_day    DATE;
  v_out    JSONB;
BEGIN
  SELECT * INTO v_season FROM public.pool_seasons WHERE id = p_season_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_day := COALESCE(p_day, (
    SELECT MAX(g.game_date) FROM public.nhl_games g
    WHERE g.season = v_season.nhl_season
      AND g.game_type = ANY (v_season.game_types)
      AND g.game_state IN ('OFF', 'FINAL')
  ));
  IF v_day IS NULL THEN RETURN NULL; END IF;

  WITH
  -- Every rostered player's night, with who owns him. One row per
  -- entry/player, so "whose player was it" is never guessed.
  night AS (
    SELECT e.id AS entry_id, e.team_name, rs.player_id, np.full_name, np.team_abbrev,
           rs.slot_position, rs.price_cents,
           (rs.player_id IN (e.star_forward_id, e.star_defense_id)) AS is_star,
           COALESCE(pgp.pts, 0) AS raw_pts,
           COALESCE(pgp.pts, 0) * CASE WHEN v_season.stars_enabled
                                        AND rs.player_id IN (e.star_forward_id, e.star_defense_id)
                                   THEN 2 ELSE 1 END AS pts,
           (pgp.game_id IS NOT NULL) AS played
    FROM public.pool_entries e
    JOIN public.pool_roster_slots rs ON rs.entry_id = e.id AND rs.effective_to IS NULL
    JOIN public.nhl_players np ON np.player_id = rs.player_id
    LEFT JOIN public.pool_player_game_points pgp
           ON pgp.player_id = rs.player_id AND pgp.pool_season_id = p_season_id
          AND pgp.game_date = v_day
    WHERE e.season_id = p_season_id AND e.is_confirmed
  ),
  per_entry AS (
    SELECT n.entry_id, n.team_name, SUM(n.pts) AS night_pts
    FROM night n GROUP BY n.entry_id, n.team_name
  )
  SELECT jsonb_build_object(
    'game_day', v_day,
    'games', (SELECT COUNT(*) FROM public.nhl_games g
               WHERE g.season = v_season.nhl_season AND g.game_date = v_day
                 AND g.game_state IN ('OFF','FINAL')),

    -- Standings after the night, with the movement the arrows are based on.
    'standings', (
      SELECT jsonb_agg(jsonb_build_object(
               'team', e.team_name, 'rank', st.rank, 'previous_rank', st.previous_rank,
               'total', st.fantasy_points, 'night', COALESCE(pe.night_pts, 0))
             ORDER BY st.rank)
      FROM public.pool_standings st
      JOIN public.pool_entries e ON e.id = st.entry_id
      LEFT JOIN per_entry pe ON pe.entry_id = e.id
      WHERE st.season_id = p_season_id AND e.is_confirmed
    ),

    -- The night's best skaters, and who owned them.
    'top_performers', (
      SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('player', n.full_name, 'club', n.team_abbrev,
                 'pos', n.slot_position, 'pts', n.pts, 'star', n.is_star,
                 'salary_m', round(n.price_cents/1e8, 2), 'owner', n.team_name) AS x
        FROM night n WHERE n.pts > 0 ORDER BY n.pts DESC, n.price_cents ASC LIMIT 6
      ) q
    ),

    -- Expensive and silent: the heart of the value-for-money angle.
    'expensive_blanks', (
      SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('player', n.full_name, 'club', n.team_abbrev,
                 'salary_m', round(n.price_cents/1e8, 2), 'owner', n.team_name,
                 'played', n.played, 'star', n.is_star) AS x
        FROM night n
        WHERE n.pts = 0 AND n.price_cents >= 500000000  -- 5 M$ and up
        ORDER BY n.price_cents DESC LIMIT 6
      ) q
    ),

    -- Cheap and productive, the opposite bet.
    'bargains', (
      SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('player', n.full_name, 'club', n.team_abbrev,
                 'pts', n.pts, 'salary_m', round(n.price_cents/1e8, 2),
                 'owner', n.team_name) AS x
        FROM night n
        WHERE n.pts > 0 AND n.price_cents <= 300000000  -- 3 M$ or less
        ORDER BY n.pts DESC, n.price_cents ASC LIMIT 5
      ) q
    ),

    -- Did the doubled pick pay off? One row per entry that has stars.
    'stars', (
      SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('owner', n.team_name, 'player', n.full_name,
                 'pos', n.slot_position, 'pts', n.pts,
                 'salary_m', round(n.price_cents/1e8, 2), 'played', n.played) AS x
        FROM night n WHERE n.is_star ORDER BY n.pts DESC
      ) q
    ),

    -- Paying for someone who is not dressing.
    'not_dressing', (
      SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('player', n.full_name, 'club', n.team_abbrev,
                 'salary_m', round(n.price_cents/1e8, 2), 'owner', n.team_name) AS x
        FROM night n
        WHERE public.pool_player_is_out(p_season_id, n.player_id)
        ORDER BY n.price_cents DESC LIMIT 5
      ) q
    ),

    -- The crowd's picks: a player on many rosters moves the whole standings.
    'most_owned', (
      SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('player', n.full_name, 'club', n.team_abbrev,
                 'owners', COUNT(*), 'pts', MAX(n.raw_pts),
                 'salary_m', round(MAX(n.price_cents)/1e8, 2)) AS x
        FROM night n GROUP BY n.full_name, n.team_abbrev
        HAVING COUNT(*) >= 3 ORDER BY COUNT(*) DESC, MAX(n.raw_pts) DESC LIMIT 5
      ) q
    ),

    -- The clubs poolers picked, which score on their own (base + goals).
    'team_picks', (
      SELECT jsonb_agg(x) FROM (
        SELECT jsonb_build_object('owner', e.team_name, 'club', e.team_pick,
                 'pts', round(tgp.pts, 2)) AS x
        FROM public.pool_entries e
        JOIN public.pool_team_game_points tgp
          ON tgp.pool_season_id = p_season_id AND tgp.team_abbrev = e.team_pick
         AND tgp.game_date = v_day
        WHERE e.season_id = p_season_id AND e.is_confirmed
        ORDER BY tgp.pts DESC
      ) q
    ),

    -- So the bot can state the rules correctly when it explains a score.
    'rules', jsonb_build_object(
      'budget_m', round(v_season.budget_cents/1e8, 1),
      'roster', format('%sF/%sD/%sG', v_season.roster_f, v_season.roster_d, v_season.roster_g),
      'defense_point_value', v_season.defense_point_value,
      'stars_enabled', v_season.stars_enabled,
      'team_pick_free', TRUE,
      'scoring', (SELECT jsonb_object_agg(stat_key, coefficient)
                    FROM public.pool_scoring_rules WHERE season_id = p_season_id)
    )
  ) INTO v_out;

  -- Nothing happened: no confirmed entry scored and nobody played.
  IF COALESCE(jsonb_array_length(v_out->'standings'), 0) = 0 THEN RETURN NULL; END IF;
  RETURN v_out;
END $$;

REVOKE EXECUTE ON FUNCTION public.pool_daily_digest(BIGINT, DATE) FROM anon, authenticated;

-- ── Verification ──────────────────────────────────────────────────────────
--   SELECT jsonb_pretty(public.pool_daily_digest(1));
