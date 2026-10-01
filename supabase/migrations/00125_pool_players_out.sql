-- Pool LNH — show which rostered players are not playing.
--
-- A member looking at their team sees a row of zeros and cannot tell apart
-- "he played and did nothing" from "he did not dress". Alex Ovechkin at GP 0
-- looks identical to a healthy player on an off night.
--
-- There is no injury feed: the NHL publishes none that can be relied on, and
-- nothing in this database knows who is hurt. What it knows is who dressed.
-- 00115 already turned that into a rule for trades — a player who was in none
-- of his club's last `trade_injury_missed_games` games counts as out — and
-- this reuses that exact function rather than inventing a second definition.
-- One meaning of "out" across the whole pool: the badge on the roster and the
-- trade the badge unlocks always agree.
--
-- It is therefore "did not dress", not "injured": it also catches healthy
-- scratches and minor-league assignments, which leave a pooler in the same
-- position.
--
-- Takes the ids in one array so a roster costs one round trip instead of
-- eighteen.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.pool_players_out(p_season_id BIGINT, p_player_ids BIGINT[])
RETURNS TABLE (player_id BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id
  FROM unnest(COALESCE(p_player_ids, '{}'::BIGINT[])) AS id
  WHERE public.pool_player_is_out(p_season_id, id);
$$;

-- Rosters are public (00071), so this says nothing a visitor cannot already
-- read from the boxscores.
GRANT EXECUTE ON FUNCTION public.pool_players_out(BIGINT, BIGINT[]) TO anon, authenticated;

-- ── Verification ──────────────────────────────────────────────────────────
-- Who on one entry's roster is currently sitting out:
--   SELECT np.full_name, np.team_abbrev
--   FROM public.pool_players_out(1, ARRAY(
--     SELECT player_id FROM public.pool_roster_slots
--     WHERE entry_id = <entry_id> AND effective_to IS NULL
--   )) o
--   JOIN public.nhl_players np ON np.player_id = o.player_id;
--
-- Empty before the season, and empty for any club that has not played its
-- configured number of games yet — there is nothing to have missed.
