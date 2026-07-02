-- Pool LNH — make rosters publicly viewable.
--
-- Originally rosters were hidden from non-owners until the draft deadline
-- (anti-copying). The product choice is now full transparency: anyone can
-- click a team in the standings and see its lineup. So roster reads become
-- public. (Writes are still RPC-only — pool_save_roster / pool_make_transaction.)

DROP POLICY IF EXISTS pool_roster_read ON public.pool_roster_slots;
CREATE POLICY pool_roster_read ON public.pool_roster_slots FOR SELECT USING (true);
