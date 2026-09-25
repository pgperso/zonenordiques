-- Pool LNH — no player is draftable without a real salary.
--
-- Owner's rule: a player the file leaves without a salary is simply not
-- draftable, until the owner types one in by hand.
--
-- Two gaps stood in the way:
--
--  1. A derived price looked exactly like a real one. Zakhar Bardakov sat at
--     3.10 M$ — a figure invented by seedPoolSeason's derivation — and was
--     perfectly draftable, in a pool where every other price came from the
--     owner's spreadsheet. 00113 made the difference visible; this makes it
--     binding.
--
--  2. A player the file mentions but cannot price had nowhere to be recorded.
--     price_cents CHECK (> 0) forbade a "no salary yet" row, so the 27 pending
--     free agents left no trace in pool_player_prices at all — which is why
--     they could not be listed for pricing, only re-discovered by re-importing.
--
-- So: 0 now means "no salary yet", and a CHECK makes `is_draftable` impossible
-- without a verified, positive price. The rule can no longer be broken by a
-- future code path that forgets it.
--
-- Idempotent.

-- ── 1. Allow a "no salary yet" row ────────────────────────────────────────
-- The original CHECK was created inline, so its name is whatever Postgres
-- chose. Drop whichever constraint is the `price_cents > 0` one rather than
-- guessing a name — a missed DROP would silently keep 0 unwritable and the
-- whole feature would fail closed with no error to read.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'pool_player_prices'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%price_cents > 0%'
  LOOP
    EXECUTE format('ALTER TABLE public.pool_player_prices DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.pool_player_prices DROP CONSTRAINT IF EXISTS pool_prices_price_nonneg_ck;
ALTER TABLE public.pool_player_prices
  ADD CONSTRAINT pool_prices_price_nonneg_ck CHECK (price_cents >= 0);

COMMENT ON COLUMN public.pool_player_prices.price_cents IS
  'Cap hit in cents. 0 = no salary known yet; such a player is never draftable.';

-- ── 2. Retire every player who is not on a verified price ─────────────────
-- Must run before the constraint below, or existing rows would reject it.
UPDATE public.pool_player_prices
   SET is_draftable = FALSE
 WHERE imported_at IS NULL AND is_draftable;

-- ── 3. Make it structural ─────────────────────────────────────────────────
ALTER TABLE public.pool_player_prices DROP CONSTRAINT IF EXISTS pool_prices_draftable_verified_ck;
ALTER TABLE public.pool_player_prices
  ADD CONSTRAINT pool_prices_draftable_verified_ck
  CHECK (NOT is_draftable OR (price_cents > 0 AND imported_at IS NOT NULL));

-- ── 4. The owner's worklist ───────────────────────────────────────────────
-- Everything still waiting for a real salary, in one place: the ones with an
-- invented price and the ones with none at all.
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
WHERE pp.imported_at IS NULL;

-- ── Verification ──────────────────────────────────────────────────────────
-- A) Nobody draftable on an unverified price (expect 0):
--      SELECT COUNT(*) FROM public.pool_player_prices
--      WHERE season_id = 1 AND is_draftable AND imported_at IS NULL;
--
-- B) The worklist, as the admin page will show it:
--      SELECT full_name, team_abbrev, position, price_cents, reason
--      FROM public.pool_players_to_price WHERE season_id = 1
--      ORDER BY reason, full_name;
--
-- C) How many players a member can actually draft:
--      SELECT position, COUNT(*) FROM public.pool_player_prices
--      WHERE season_id = 1 AND is_draftable GROUP BY position;
