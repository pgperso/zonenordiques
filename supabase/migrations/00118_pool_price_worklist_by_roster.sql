-- Pool LNH — the "players to price" worklist only lists positions the season
-- actually drafts.
--
-- A season with roster_g = 0 never drafts a goalie: the NHL club pick replaces
-- them, and since 00114 that pick is free, so a goalie's cap hit now decides
-- nothing at all. Yet 70 unpriced goalies sat in the owner's worklist asking
-- for a salary that would change nothing — burying the handful of skaters that
-- genuinely need one.
--
-- Driven by the season's own roster_* columns rather than a hard-coded rule:
-- re-enable goalies and they come back on their own.
--
-- Idempotent.

CREATE OR REPLACE VIEW public.pool_players_to_price AS
SELECT
  pp.season_id,
  pp.player_id,
  np.full_name,
  np.team_abbrev,
  pp.position,
  pp.price_cents,
  pp.proj_points,
  CASE WHEN pp.price_cents > 0 THEN 'derived' ELSE 'missing' END AS reason
FROM public.pool_player_prices pp
JOIN public.nhl_players np ON np.player_id = pp.player_id
JOIN public.pool_seasons s ON s.id = pp.season_id
WHERE pp.imported_at IS NULL
  AND CASE pp.position
        WHEN 'F' THEN s.roster_f
        WHEN 'D' THEN s.roster_d
        WHEN 'G' THEN s.roster_g
        ELSE 0
      END > 0;

-- ── Verification ──────────────────────────────────────────────────────────
-- What is left to price, by position (goalies should be gone while
-- roster_g = 0):
--   SELECT position, COUNT(*) FROM public.pool_players_to_price
--   WHERE season_id = 1 GROUP BY position;
--
-- The full picture, including the positions now hidden:
--   SELECT pp.position, COUNT(*) FROM public.pool_player_prices pp
--   WHERE pp.season_id = 1 AND pp.imported_at IS NULL GROUP BY pp.position;
