-- Pool LNH — star players are locked once the season starts, EXCEPT after a
-- trade: trading away a star clears that position's star, and the pooler may
-- then re-designate a new star for that (now empty) position.
--
--  * pool_make_transaction: a traded-away star is CLEARED (not transferred).
--  * pool_set_stars: pre-lock, set freely. Post-lock, may only FILL an empty
--    star slot (the one a trade just cleared) — a star already set can't change.

CREATE OR REPLACE FUNCTION public.pool_set_stars(p_entry_id BIGINT, p_forward BIGINT, p_defense BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry public.pool_entries%ROWTYPE; v_season public.pool_seasons%ROWTYPE;
  v_locked BOOLEAN; v_fwd BIGINT; v_def BIGINT;
BEGIN
  PERFORM set_config('pool.privileged', '1', true);
  SELECT * INTO v_entry FROM public.pool_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscription introuvable'; END IF;
  IF v_entry.member_id <> auth.uid() THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  SELECT * INTO v_season FROM public.pool_seasons WHERE id = v_entry.season_id;

  v_locked := v_season.lock_at IS NOT NULL AND NOW() >= v_season.lock_at;
  v_fwd := p_forward;
  v_def := p_defense;

  -- Once locked, a star that's already set is frozen; only an empty slot
  -- (cleared by a trade) may be (re)assigned.
  IF v_locked THEN
    IF v_entry.star_forward_id IS NOT NULL THEN v_fwd := v_entry.star_forward_id; END IF;
    IF v_entry.star_defense_id IS NOT NULL THEN v_def := v_entry.star_defense_id; END IF;
  END IF;

  IF v_fwd IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pool_roster_slots
    WHERE entry_id = p_entry_id AND effective_to IS NULL AND player_id = v_fwd AND slot_position = 'F'
  ) THEN RAISE EXCEPTION 'Attaquant vedette invalide'; END IF;
  IF v_def IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.pool_roster_slots
    WHERE entry_id = p_entry_id AND effective_to IS NULL AND player_id = v_def AND slot_position = 'D'
  ) THEN RAISE EXCEPTION 'Défenseur vedette invalide'; END IF;

  UPDATE public.pool_entries
     SET star_forward_id = v_fwd,
         star_defense_id = v_def,
         -- Pre-lock changes re-open confirmation; post-lock fills don't drop the
         -- team from the standings.
         is_confirmed = CASE WHEN v_locked THEN is_confirmed ELSE FALSE END,
         updated_at = NOW()
   WHERE id = p_entry_id;
END $$;

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
  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé après l''échange (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;

  UPDATE public.pool_entries
     SET spent_cents = v_spent,
         transactions_used = transactions_used + 1,
         -- Trading away a star frees that slot so the pooler can re-decide.
         star_forward_id = CASE WHEN star_forward_id = p_drop_player THEN NULL ELSE star_forward_id END,
         star_defense_id = CASE WHEN star_defense_id = p_drop_player THEN NULL ELSE star_defense_id END,
         updated_at = NOW()
   WHERE id = p_entry_id;
  INSERT INTO public.pool_transactions (entry_id, dropped_player_id, added_player_id, slot_position)
  VALUES (p_entry_id, p_drop_player, p_add_player, v_slot.slot_position);
END $$;
