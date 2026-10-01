-- Pool LNH — the standings table must contain the standings.
--
-- pool_refresh_standings ranked every entry of the season. The pages that
-- show the standings rank only CONFIRMED entries, as they should — an
-- unconfirmed roster is not competing. So pool_standings held a parallel,
-- larger league nobody could see.
--
-- It surfaced the first night the bot spoke: it announced "Reaper au sommet
-- du Pool LNH (25 pts)" straight from pool_standings, while every page showed
-- Le Buffet de Gary leading with 15.5 and no Reaper anywhere. Reaper had
-- stopped being confirmed — saving a roster un-confirms it, and so does going
-- over the cap after a reprice — but kept rank 1 in the table.
--
-- Fixing the reader would have fixed the bot and left the trap for the next
-- thing that reads this table. So the table itself now holds what everyone
-- means by "the standings", and rows for entries that are no longer confirmed
-- are removed rather than left to rot at a rank they no longer hold.
--
-- Same body as 00119 otherwise, including the p_live guard on previous_rank.
--
-- Idempotent.

-- 00119 added a second overload (p_live) beside the original one-argument
-- function instead of replacing it, so every one-argument call became
-- ambiguous — and PostgREST, which names its arguments, kept resolving to the
-- OLD function. The p_live guard has never actually run. Drop the old one so
-- there is a single definition and a single behaviour.
DROP FUNCTION IF EXISTS public.pool_refresh_standings(BIGINT);

CREATE OR REPLACE FUNCTION public.pool_refresh_standings(p_season_id BIGINT, p_live BOOLEAN DEFAULT FALSE)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_last_day DATE; v_stars BOOLEAN;
BEGIN
  IF NOT pg_try_advisory_xact_lock(p_season_id) THEN RETURN; END IF;

  SELECT stars_enabled INTO v_stars FROM public.pool_seasons WHERE id = p_season_id;

  SELECT MAX(game_date) INTO v_last_day
  FROM public.pool_player_game_points WHERE pool_season_id = p_season_id;

  -- An entry that un-confirms leaves the standings. Without this its last
  -- ranked row stays behind, and anything reading the table — the bot, a
  -- future feature — sees a team the site says is not playing.
  DELETE FROM public.pool_standings st
   WHERE st.season_id = p_season_id
     AND NOT EXISTS (
       SELECT 1 FROM public.pool_entries e
        WHERE e.id = st.entry_id AND e.is_confirmed
     );

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
    WHERE e.season_id = p_season_id AND e.is_confirmed
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
    WHERE e.season_id = p_season_id AND e.is_confirmed
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

-- Drop the rows the old behaviour left behind, and re-rank what remains.
SELECT public.pool_refresh_standings(id) FROM public.pool_seasons;

-- ── Verification ──────────────────────────────────────────────────────────
-- Expect 0 rows — nobody ranked who is not confirmed:
--   SELECT e.team_name, st.rank, st.fantasy_points
--   FROM public.pool_standings st
--   JOIN public.pool_entries e ON e.id = st.entry_id
--   WHERE st.season_id = 1 AND NOT e.is_confirmed;
--
-- And the table's leader should be the one the site shows:
--   SELECT e.team_name, st.rank, st.fantasy_points
--   FROM public.pool_standings st
--   JOIN public.pool_entries e ON e.id = st.entry_id
--   WHERE st.season_id = 1 ORDER BY st.rank LIMIT 3;
