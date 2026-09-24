-- Pool LNH — keep stored salary masses in step with a price change, and tell a
-- member why their team suddenly costs more.
--
-- The rule: BEFORE an entry is locked, everybody faces the same, current
-- prices ("le prix du jour, pour tous"). AFTER it is locked, prices are frozen
-- — the intent stated at 00067 lines 17-18 ("the price snapshotted onto the
-- slot so a later price edit can't retro-change a drafted roster"), which
-- pool_make_transaction already honours.
--
-- Two things did not follow that rule:
--
--  1. pool_roster_slots.price_cents is snapshotted on INSERT and
--     pool_entries.spent_cents is only recomputed when the member writes. So
--     after a salary import, "Mon équipe" showed the salary mass as of the
--     last save while the composer priced the same roster differently. The
--     member found out only when they next pressed Enregistrer — which
--     re-prices the whole roster and can refuse a team that was legal when
--     built.
--
--  2. That refusal said only "Budget dépassé (105.3/100.0 M$)". Nothing named
--     the price change, so the number read as an arithmetic bug in the pool.
--
-- Everything here is idempotent: safe to re-run.

-- ── 1. Re-price the entries that are still open ───────────────────────────
--
-- Locked entries are deliberately skipped: their prices are frozen by design,
-- and re-pricing them could push a finished, ranked roster over the cap for a
-- reason its owner can no longer act on.
--
-- spent_cents = active slots + team price, the same formula as
-- pool_save_roster / pool_confirm_entry / pool_make_transaction. A salary
-- import moves goalie prices too, and the team price is the two highest goalie
-- cap hits (00076), so leaving it out would re-introduce the divergence this
-- migration exists to remove.
CREATE OR REPLACE FUNCTION public.pool_reprice_open_entries(p_season_id BIGINT)
RETURNS TABLE (entries_repriced INT, entries_over_budget INT, entries_unconfirmed INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_budget BIGINT;
BEGIN
  -- spent_cents and is_confirmed are guarded columns (00079); maintenance
  -- writes use the same bypass the RPCs do.
  PERFORM set_config('pool.privileged', '1', true);

  SELECT budget_cents INTO v_budget FROM public.pool_seasons WHERE id = p_season_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saison introuvable (%)', p_season_id; END IF;

  -- Active slots of open entries go to today's price. A player with no price
  -- row left keeps their snapshot rather than falling to zero.
  UPDATE public.pool_roster_slots rs
     SET price_cents = pp.price_cents
    FROM public.pool_entries e,
         public.pool_player_prices pp
   WHERE rs.entry_id = e.id
     AND e.season_id = p_season_id
     AND e.is_locked = FALSE
     AND rs.effective_to IS NULL
     AND pp.season_id = p_season_id
     AND pp.player_id = rs.player_id
     AND rs.price_cents IS DISTINCT FROM pp.price_cents;

  WITH totals AS (
    SELECT e.id,
           COALESCE((SELECT SUM(rs.price_cents)
                       FROM public.pool_roster_slots rs
                      WHERE rs.entry_id = e.id AND rs.effective_to IS NULL), 0)
             + public.pool_team_price(e.season_id, e.team_pick) AS total
    FROM public.pool_entries e
    WHERE e.season_id = p_season_id AND e.is_locked = FALSE
  )
  UPDATE public.pool_entries e
     SET spent_cents = t.total, updated_at = NOW()
    FROM totals t
   WHERE e.id = t.id AND e.spent_cents IS DISTINCT FROM t.total;
  GET DIAGNOSTICS entries_repriced = ROW_COUNT;

  -- A confirmed roster that is now over the cap must go back to the member:
  -- pool_confirm_entry would refuse it today, so leaving it confirmed would
  -- carry an illegal team into the lock.
  UPDATE public.pool_entries e
     SET is_confirmed = FALSE, confirmed_at = NULL, updated_at = NOW()
   WHERE e.season_id = p_season_id
     AND e.is_locked = FALSE
     AND e.is_confirmed
     AND e.spent_cents > v_budget;
  GET DIAGNOSTICS entries_unconfirmed = ROW_COUNT;

  SELECT COUNT(*)::INT INTO entries_over_budget
  FROM public.pool_entries e
  WHERE e.season_id = p_season_id
    AND e.is_locked = FALSE
    AND e.spent_cents > v_budget;

  RETURN NEXT;
END $$;

-- Derived maintenance, like pool_refresh_standings: never a client call.
REVOKE EXECUTE ON FUNCTION public.pool_reprice_open_entries(BIGINT) FROM anon, authenticated;

-- ── 2. Let the owner see who is over the cap ──────────────────────────────
CREATE OR REPLACE FUNCTION public.pool_entries_over_budget(p_season_id BIGINT)
RETURNS TABLE (entry_id BIGINT, team_name TEXT, spent_cents BIGINT, budget_cents BIGINT,
               is_locked BOOLEAN, is_confirmed BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.id, e.team_name, e.spent_cents, s.budget_cents, e.is_locked, e.is_confirmed
  FROM public.pool_entries e
  JOIN public.pool_seasons s ON s.id = e.season_id
  WHERE e.season_id = p_season_id
    AND e.spent_cents > s.budget_cents
  ORDER BY e.spent_cents DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.pool_entries_over_budget(BIGINT) FROM anon, authenticated;

-- ── 3. Say WHY the budget is exceeded ─────────────────────────────────────
-- Identical to the 00077 body (team price, star cleanup, un-confirm on save)
-- except for the budget message: it now reports how much the players the
-- member KEPT have risen since their last save. That part of the overrun is
-- the part they did not choose and cannot otherwise see.
CREATE OR REPLACE FUNCTION public.pool_save_roster(p_entry_id BIGINT, p_picks JSONB)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry public.pool_entries%ROWTYPE; v_season public.pool_seasons%ROWTYPE;
  v_spent BIGINT; v_f INT; v_d INT; v_g INT;
  v_drift BIGINT;
BEGIN
  PERFORM set_config('pool.privileged', '1', true);
  SELECT * INTO v_entry FROM public.pool_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscription introuvable'; END IF;
  IF v_entry.member_id <> auth.uid() THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  IF v_entry.is_locked THEN RAISE EXCEPTION 'Alignement verrouillé'; END IF;
  SELECT * INTO v_season FROM public.pool_seasons WHERE id = v_entry.season_id;
  IF v_season.lock_at IS NOT NULL AND NOW() >= v_season.lock_at THEN
    RAISE EXCEPTION 'La période de composition est terminée';
  END IF;

  -- How much the kept players moved, measured before the slots are replaced.
  SELECT COALESCE(SUM(pp.price_cents - rs.price_cents), 0) INTO v_drift
  FROM public.pool_roster_slots rs
  JOIN public.pool_player_prices pp
    ON pp.season_id = v_entry.season_id AND pp.player_id = rs.player_id
  WHERE rs.entry_id = p_entry_id AND rs.effective_to IS NULL
    AND rs.player_id IN (
      SELECT (x->>'player_id')::BIGINT FROM jsonb_array_elements(p_picks) x
    );

  DELETE FROM public.pool_roster_slots WHERE entry_id = p_entry_id;
  INSERT INTO public.pool_roster_slots (entry_id, player_id, slot_position)
  SELECT p_entry_id, (x->>'player_id')::BIGINT, x->>'slot_position'
  FROM jsonb_array_elements(p_picks) x;

  SELECT COALESCE(SUM(price_cents),0),
         COUNT(*) FILTER (WHERE slot_position='F'),
         COUNT(*) FILTER (WHERE slot_position='D'),
         COUNT(*) FILTER (WHERE slot_position='G')
    INTO v_spent, v_f, v_d, v_g
  FROM public.pool_roster_slots WHERE entry_id = p_entry_id AND effective_to IS NULL;

  v_spent := v_spent + public.pool_team_price(v_entry.season_id, v_entry.team_pick);

  IF v_spent > v_season.budget_cents THEN
    IF v_drift > 0 THEN
      RAISE EXCEPTION 'Budget dépassé (%/% M$) — le prix de joueurs déjà dans ton équipe a monté de % M$ depuis ta dernière sauvegarde. Retire un joueur pour revenir sous le plafond.',
        round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1), round(v_drift/1e8,1);
    END IF;
    RAISE EXCEPTION 'Budget dépassé (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;
  IF v_f > v_season.roster_f OR v_d > v_season.roster_d OR v_g > v_season.roster_g THEN
    RAISE EXCEPTION 'Trop de joueurs (F:% D:% G:%)', v_f, v_d, v_g;
  END IF;

  -- Drop stars that are no longer rostered.
  UPDATE public.pool_entries e SET
    star_forward_id = CASE WHEN EXISTS (SELECT 1 FROM public.pool_roster_slots rs
      WHERE rs.entry_id = e.id AND rs.effective_to IS NULL AND rs.player_id = e.star_forward_id) THEN e.star_forward_id ELSE NULL END,
    star_defense_id = CASE WHEN EXISTS (SELECT 1 FROM public.pool_roster_slots rs
      WHERE rs.entry_id = e.id AND rs.effective_to IS NULL AND rs.player_id = e.star_defense_id) THEN e.star_defense_id ELSE NULL END
  WHERE e.id = p_entry_id;

  UPDATE public.pool_entries SET spent_cents = v_spent, is_confirmed = FALSE, updated_at = NOW() WHERE id = p_entry_id;
END $$;

GRANT EXECUTE ON FUNCTION public.pool_save_roster(BIGINT, JSONB) TO authenticated;

-- ── 4. One-time: bring existing open entries in line ──────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.pool_seasons LOOP
    PERFORM public.pool_reprice_open_entries(r.id);
  END LOOP;
END $$;

-- ── Verification ──────────────────────────────────────────────────────────
-- A) Who is over the cap (should be empty right after an import):
--      SELECT * FROM public.pool_entries_over_budget(<season_id>);
--
-- B) Stored aggregate matches the slots + team price, for open entries
--    (should return 0 rows):
--      SELECT e.id, e.spent_cents,
--             COALESCE((SELECT SUM(rs.price_cents) FROM public.pool_roster_slots rs
--                        WHERE rs.entry_id = e.id AND rs.effective_to IS NULL), 0)
--               + public.pool_team_price(e.season_id, e.team_pick) AS recompute
--      FROM public.pool_entries e
--      WHERE e.season_id = <season_id> AND e.is_locked = FALSE
--        AND e.spent_cents <> COALESCE((SELECT SUM(rs.price_cents) FROM public.pool_roster_slots rs
--                        WHERE rs.entry_id = e.id AND rs.effective_to IS NULL), 0)
--               + public.pool_team_price(e.season_id, e.team_pick);
