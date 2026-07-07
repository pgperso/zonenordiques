-- ============================================================
-- 00088: Require star players on confirm when stars are enabled
--
-- The composer's Confirm button is disabled until a star F + star D are
-- chosen, but pool_confirm_entry (the SECURITY DEFINER RPC that actually
-- activates the entry) never enforced it — so a crafted call could confirm
-- a lineup with no stars. Add the server-side requirement, mirroring the
-- existing "team pick required" check.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pool_confirm_entry(p_entry_id BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry public.pool_entries%ROWTYPE; v_season public.pool_seasons%ROWTYPE;
  v_spent BIGINT; v_f INT; v_d INT; v_g INT;
BEGIN
  PERFORM set_config('pool.privileged', '1', true);
  SELECT * INTO v_entry FROM public.pool_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscription introuvable'; END IF;
  IF v_entry.member_id <> auth.uid() THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  SELECT * INTO v_season FROM public.pool_seasons WHERE id = v_entry.season_id;
  IF v_season.lock_at IS NOT NULL AND NOW() >= v_season.lock_at THEN
    RAISE EXCEPTION 'La période de composition est terminée';
  END IF;

  SELECT COALESCE(SUM(price_cents),0),
         COUNT(*) FILTER (WHERE slot_position='F'),
         COUNT(*) FILTER (WHERE slot_position='D'),
         COUNT(*) FILTER (WHERE slot_position='G')
    INTO v_spent, v_f, v_d, v_g
  FROM public.pool_roster_slots WHERE entry_id = p_entry_id AND effective_to IS NULL;
  v_spent := v_spent + public.pool_team_price(v_entry.season_id, v_entry.team_pick);

  IF v_f <> v_season.roster_f OR v_d <> v_season.roster_d OR v_g <> v_season.roster_g THEN
    RAISE EXCEPTION 'Alignement incomplet (att %/%, déf %/%, gardiens %/%)',
      v_f, v_season.roster_f, v_d, v_season.roster_d, v_g, v_season.roster_g;
  END IF;
  IF v_season.roster_teams > 0 AND v_entry.team_pick IS NULL THEN
    RAISE EXCEPTION 'Choisis une équipe de la LNH';
  END IF;
  -- Stars are mandatory when the season enables them.
  IF v_season.stars_enabled THEN
    IF (v_season.roster_f > 0 AND v_entry.star_forward_id IS NULL)
       OR (v_season.roster_d > 0 AND v_entry.star_defense_id IS NULL) THEN
      RAISE EXCEPTION 'Choisis tes joueurs vedettes (1 attaquant et 1 défenseur)';
    END IF;
  END IF;
  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;

  UPDATE public.pool_entries SET is_confirmed = TRUE, confirmed_at = NOW(), updated_at = NOW() WHERE id = p_entry_id;
END $$;
