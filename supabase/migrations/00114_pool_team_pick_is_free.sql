-- Pool LNH — the NHL team pick is free.
--
-- Rule change, decided by the owner: choosing a club is part of composing a
-- team, not a purchase. It no longer counts against the salary cap.
--
-- Until now the pick cost the total of that club's two official goalies' cap
-- hits (00076), added to spent_cents by pool_save_roster, pool_set_team,
-- pool_confirm_entry, pool_make_transaction and pool_reprice_open_entries —
-- nine call sites across six migrations. They all go through
-- pool_team_price(), which 00076 built to be exactly this propagation point:
--
--   "The view and the three budget RPCs all call pool_team_price(), so
--    replacing the function propagates everywhere automatically."
--
-- So the function returns 0 and every caller follows, with no risk of one
-- being missed. The call sites keep the `+ pool_team_price(...)` term rather
-- than deleting it, so restoring the old rule stays a one-function change.
--
-- The pool_team_price_stats view keeps its price_cents column, now 0 for
-- every club. That is the truth — a team costs nothing — and the pool UI no
-- longer displays it.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.pool_team_price(p_season_id BIGINT, p_team TEXT)
RETURNS BIGINT LANGUAGE sql STABLE SET search_path = public AS $$
  -- Free. Kept as a function, and kept called everywhere, so the rule lives in
  -- one place; see this migration's header before changing it back.
  SELECT 0::BIGINT;
$$;

-- ── Take the team cost off every stored salary mass ───────────────────────
-- Locked entries are recomputed too, unlike a price change: their player
-- prices stay frozen (the SUM below reads the snapshotted slot prices), and
-- only the team component — which is now zero for everyone — comes off. A
-- locked roster can only get cheaper here, never over the cap.
DO $$
BEGIN
  PERFORM set_config('pool.privileged', '1', true);
  UPDATE public.pool_entries e SET spent_cents =
    COALESCE((SELECT SUM(price_cents) FROM public.pool_roster_slots
              WHERE entry_id = e.id AND effective_to IS NULL), 0)
    + public.pool_team_price(e.season_id, e.team_pick);
END $$;

-- ── Verification ──────────────────────────────────────────────────────────
-- A) Every team is free:
--      SELECT COUNT(*) FROM public.pool_team_price_stats WHERE price_cents <> 0;
--    -- expect 0
--
-- B) Stored masses equal the players alone:
--      SELECT e.id, e.team_name, e.spent_cents,
--             COALESCE((SELECT SUM(rs.price_cents) FROM public.pool_roster_slots rs
--                        WHERE rs.entry_id = e.id AND rs.effective_to IS NULL), 0) AS joueurs
--      FROM public.pool_entries e
--      WHERE e.season_id = 1
--        AND e.spent_cents <> COALESCE((SELECT SUM(rs.price_cents) FROM public.pool_roster_slots rs
--                        WHERE rs.entry_id = e.id AND rs.effective_to IS NULL), 0);
--    -- expect 0 rows
--
-- C) Who is still over the cap (the one blocked entry should be freed):
--      SELECT * FROM public.pool_entries_over_budget(1);
