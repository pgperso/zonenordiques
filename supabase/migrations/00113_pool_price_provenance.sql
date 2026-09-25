-- Pool LNH — tell a real salary apart from a derived placeholder.
--
-- The rule for a player the salary file leaves blank is "keep the last known
-- salary until an update comes". That rule is only safe if "known" can be
-- verified, and until now it could not: pool_player_prices holds a number with
-- no provenance, so a cap hit imported from the operator's spreadsheet and a
-- figure invented by seedPoolSeason's derivation look identical.
--
-- It matters right now. The 2026-27 file marks pending free agents with a "°"
-- and leaves their salary empty — Fantilli, Tarasenko, Evander Kane, van
-- Riemsdyk and two dozen others. Keeping "the last known salary" for them
-- silently keeps a fabricated one, in a pool where every other price is real,
-- and nothing on screen distinguishes the two.
--
-- NULL = never came from a salary import. Idempotent.

ALTER TABLE public.pool_player_prices
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

COMMENT ON COLUMN public.pool_player_prices.imported_at IS
  'When this price last came from a salary import. NULL = derived placeholder, never a real cap hit.';

-- Finding the unpriced ones is a whole-season scan on a partial condition.
CREATE INDEX IF NOT EXISTS idx_pool_prices_never_imported
  ON public.pool_player_prices(season_id)
  WHERE imported_at IS NULL;

-- ── Which draftable players are still on an invented price ────────────────
-- The operator's audit query: after an import, whoever is left here is a
-- player a member could draft at a price nobody ever verified.
CREATE OR REPLACE FUNCTION public.pool_prices_never_imported(p_season_id BIGINT)
RETURNS TABLE (player_id BIGINT, full_name TEXT, team_abbrev TEXT, position TEXT,
               price_cents BIGINT, is_draftable BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pp.player_id, np.full_name, np.team_abbrev, pp.position,
         pp.price_cents, pp.is_draftable
  FROM public.pool_player_prices pp
  JOIN public.nhl_players np ON np.player_id = pp.player_id
  WHERE pp.season_id = p_season_id
    AND pp.imported_at IS NULL
  ORDER BY pp.is_draftable DESC, pp.price_cents DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.pool_prices_never_imported(BIGINT) FROM anon, authenticated;

-- ── Verification ──────────────────────────────────────────────────────────
-- After the next import, these are the players still on a fabricated price:
--   SELECT * FROM public.pool_prices_never_imported(<season_id>);
-- Expect roughly the count the import panel reported as "sans salaire".
