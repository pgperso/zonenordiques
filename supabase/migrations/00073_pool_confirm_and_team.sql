-- Pool LNH — confirm-to-activate + NHL team selection (replacing goalies).
--
-- Changes:
--  * pool_seasons.roster_teams: how many NHL teams an entry picks (the team
--    slot that replaces goalies for now). roster_g stays as an option.
--  * pool_entries: is_confirmed/confirmed_at (the team is "active" only when
--    its roster is complete and confirmed) + team_pick (chosen NHL team).
--  * "Enregistrer" (pool_save_roster) saves progress and ALWAYS un-confirms
--    (any change requires re-confirmation). "Confirmer" (pool_confirm_entry)
--    validates the exact required counts + a team pick + budget, then activates.
--  * Standings show only confirmed entries.
--  * For the active season: goalies off, pick 1 NHL team.

ALTER TABLE public.pool_seasons ADD COLUMN IF NOT EXISTS roster_teams SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.pool_entries
  ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS team_pick TEXT REFERENCES public.nhl_teams(abbrev);

-- Active season: no goalies for now, one NHL team.
UPDATE public.pool_seasons SET roster_g = 0, roster_teams = 1 WHERE nhl_season = 20262027;

-- Guard: protect the new server-managed columns from direct client writes.
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
       OR NEW.team_pick IS DISTINCT FROM OLD.team_pick THEN
      RAISE EXCEPTION 'Champ protégé — passez par les fonctions du pool';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Save progress (partial allowed) — and always un-confirm.
CREATE OR REPLACE FUNCTION public.pool_save_roster(p_entry_id BIGINT, p_picks JSONB)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry public.pool_entries%ROWTYPE; v_season public.pool_seasons%ROWTYPE;
  v_spent BIGINT; v_f INT; v_d INT; v_g INT;
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

  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;
  IF v_f > v_season.roster_f OR v_d > v_season.roster_d OR v_g > v_season.roster_g THEN
    RAISE EXCEPTION 'Trop de joueurs (F:% D:% G:%)', v_f, v_d, v_g;
  END IF;

  UPDATE public.pool_entries
     SET spent_cents = v_spent, is_confirmed = FALSE, updated_at = NOW()
   WHERE id = p_entry_id;
END $$;

-- Set / change the entry's NHL team pick (un-confirms).
CREATE OR REPLACE FUNCTION public.pool_set_team(p_entry_id BIGINT, p_team TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry public.pool_entries%ROWTYPE; v_season public.pool_seasons%ROWTYPE;
BEGIN
  PERFORM set_config('pool.privileged', '1', true);
  SELECT * INTO v_entry FROM public.pool_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscription introuvable'; END IF;
  IF v_entry.member_id <> auth.uid() THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  SELECT * INTO v_season FROM public.pool_seasons WHERE id = v_entry.season_id;
  IF v_season.lock_at IS NOT NULL AND NOW() >= v_season.lock_at THEN
    RAISE EXCEPTION 'La période de composition est terminée';
  END IF;
  IF p_team IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.nhl_teams WHERE abbrev = p_team) THEN
    RAISE EXCEPTION 'Équipe LNH invalide';
  END IF;
  UPDATE public.pool_entries
     SET team_pick = p_team, is_confirmed = FALSE, updated_at = NOW()
   WHERE id = p_entry_id;
END $$;

-- Confirm: requires the exact roster + a team pick (if required) + budget.
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

  IF v_f <> v_season.roster_f OR v_d <> v_season.roster_d OR v_g <> v_season.roster_g THEN
    RAISE EXCEPTION 'Alignement incomplet (att %/%, déf %/%, gardiens %/%)',
      v_f, v_season.roster_f, v_d, v_season.roster_d, v_g, v_season.roster_g;
  END IF;
  IF v_season.roster_teams > 0 AND v_entry.team_pick IS NULL THEN
    RAISE EXCEPTION 'Choisis une équipe de la LNH';
  END IF;
  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;

  UPDATE public.pool_entries
     SET is_confirmed = TRUE, confirmed_at = NOW(), updated_at = NOW()
   WHERE id = p_entry_id;
END $$;

GRANT EXECUTE ON FUNCTION public.pool_set_team(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pool_confirm_entry(BIGINT) TO authenticated;
