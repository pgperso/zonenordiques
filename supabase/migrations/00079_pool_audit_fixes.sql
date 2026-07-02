-- Pool LNH — fixes from the quality audit.
--
--  1. SECURITY: pool_entry_guard didn't protect the star columns (added in
--     00077), so a client could UPDATE pool_entries.star_*_id directly,
--     bypassing pool_set_stars' validation. Add them to the guard.
--  2. BUDGET: pool_make_transaction recomputed spent_cents from roster slots
--     only, dropping the team price — making the cap check too lax post-trade
--     and the displayed cap wrong. Fold the team price back in.
--  3. DATA: recompute every entry's spent_cents (roster + team price) so the
--     stored value matches the current rules (team price = two goalies).

-- 1. Guard the star columns ------------------------------------------------
CREATE OR REPLACE FUNCTION public.pool_entry_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.pool_is_privileged() THEN
    IF NEW.is_locked IS DISTINCT FROM OLD.is_locked
       OR NEW.locked_at IS DISTINCT FROM OLD.locked_at
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.spent_cents IS DISTINCT FROM OLD.spent_cents
       OR NEW.transactions_used IS DISTINCT FROM OLD.transactions_used
       OR NEW.season_id IS DISTINCT FROM OLD.season_id
       OR NEW.is_confirmed IS DISTINCT FROM OLD.is_confirmed
       OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at
       OR NEW.team_pick IS DISTINCT FROM OLD.team_pick
       OR NEW.star_forward_id IS DISTINCT FROM OLD.star_forward_id
       OR NEW.star_defense_id IS DISTINCT FROM OLD.star_defense_id THEN
      RAISE EXCEPTION 'Champ protégé — passez par les fonctions du pool';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 2. Team price counts in the post-trade budget + spent_cents --------------
CREATE OR REPLACE FUNCTION public.pool_make_transaction(
  p_entry_id BIGINT, p_drop_player BIGINT, p_add_player BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry  public.pool_entries%ROWTYPE;
  v_season public.pool_seasons%ROWTYPE;
  v_slot   public.pool_roster_slots%ROWTYPE;
  v_add    public.pool_player_prices%ROWTYPE;
  v_today  DATE;
  v_spent  BIGINT;
BEGIN
  PERFORM set_config('pool.privileged', '1', true);
  SELECT * INTO v_entry FROM public.pool_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscription introuvable'; END IF;
  IF v_entry.member_id <> auth.uid() THEN RAISE EXCEPTION 'Non autorisé'; END IF;

  SELECT * INTO v_season FROM public.pool_seasons WHERE id = v_entry.season_id;
  IF NOT v_season.transactions_enabled THEN RAISE EXCEPTION 'Les échanges sont désactivés'; END IF;
  IF v_season.transaction_deadline IS NOT NULL AND NOW() >= v_season.transaction_deadline THEN
    RAISE EXCEPTION 'Date limite des échanges dépassée';
  END IF;
  IF v_entry.transactions_used >= v_season.max_transactions THEN
    RAISE EXCEPTION 'Limite d''échanges atteinte (%/%)', v_entry.transactions_used, v_season.max_transactions;
  END IF;

  v_today := (NOW() AT TIME ZONE v_season.timezone)::date;

  SELECT * INTO v_slot FROM public.pool_roster_slots
  WHERE entry_id = p_entry_id AND player_id = p_drop_player AND effective_to IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Joueur à retirer absent de l''alignement'; END IF;

  SELECT * INTO v_add FROM public.pool_player_prices
  WHERE season_id = v_entry.season_id AND player_id = p_add_player AND is_draftable;
  IF NOT FOUND THEN RAISE EXCEPTION 'Joueur à ajouter non disponible'; END IF;
  IF v_add.position <> v_slot.slot_position THEN
    RAISE EXCEPTION 'Position incompatible (% vs %)', v_add.position, v_slot.slot_position;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pool_roster_slots
             WHERE entry_id = p_entry_id AND player_id = p_add_player AND effective_to IS NULL) THEN
    RAISE EXCEPTION 'Joueur déjà dans l''alignement';
  END IF;

  UPDATE public.pool_roster_slots SET effective_to = v_today WHERE id = v_slot.id;
  INSERT INTO public.pool_roster_slots (entry_id, player_id, slot_position, effective_from)
  VALUES (p_entry_id, p_add_player, v_slot.slot_position, v_today);

  SELECT COALESCE(SUM(price_cents),0) INTO v_spent
  FROM public.pool_roster_slots WHERE entry_id = p_entry_id AND effective_to IS NULL;
  v_spent := v_spent + public.pool_team_price(v_entry.season_id, v_entry.team_pick);
  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé après l''échange (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;

  UPDATE public.pool_entries
     SET spent_cents = v_spent,
         transactions_used = transactions_used + 1,
         star_forward_id = CASE WHEN star_forward_id = p_drop_player THEN NULL ELSE star_forward_id END,
         star_defense_id = CASE WHEN star_defense_id = p_drop_player THEN NULL ELSE star_defense_id END,
         updated_at = NOW()
   WHERE id = p_entry_id;
  INSERT INTO public.pool_transactions (entry_id, dropped_player_id, added_player_id, slot_position)
  VALUES (p_entry_id, p_drop_player, p_add_player, v_slot.slot_position);
END $$;

-- 3. Recompute stored spent_cents to match current rules -------------------
-- spent_cents is a guarded column, so this maintenance UPDATE must run with the
-- privileged flag set (same bypass the RPCs use), inside one transaction.
DO $$
BEGIN
  PERFORM set_config('pool.privileged', '1', true);
  UPDATE public.pool_entries e SET spent_cents =
    COALESCE((SELECT SUM(price_cents) FROM public.pool_roster_slots
              WHERE entry_id = e.id AND effective_to IS NULL), 0)
    + public.pool_team_price(e.season_id, e.team_pick);
END $$;
