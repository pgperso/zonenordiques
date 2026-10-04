-- Pool LNH — une équipe qui n'a jamais joué garde une chance de se finir.
--
-- 00130 ferme la composition au premier match, pour tout le monde. Ça gelait
-- aussi cinq inscriptions jamais terminées : des membres qui ont commencé une
-- équipe, ne l'ont jamais confirmée, et n'ont donc jamais participé. Les
-- figer, c'est les punir d'un défaut d'interface — rien ne leur avait dit
-- qu'il manquait quelque chose avant le popup d'hier.
--
-- Décision du commissaire : on leur laisse une chance. Elle n'en vaut qu'une.
--
-- Le critère est confirmed_at, pas is_confirmed. Dé-confirmer — ce que fait
-- toute sauvegarde — remet is_confirmed à faux sans toucher confirmed_at, qui
-- reste donc la trace d'une participation réelle. Une équipe qui a confirmé
-- une fois puis modifié son alignement est un vrai participant et tombe sous
-- la règle ; une équipe dont confirmed_at est NULL n'a jamais été au
-- classement et n'a rien pu observer avant de choisir.
--
-- Pas d'échappatoire : dès la première confirmation, confirmed_at se remplit
-- et la composition se ferme. On ne peut pas rester non confirmé pour
-- continuer à magasiner, puisqu'une équipe non confirmée ne marque aucun
-- point.
--
-- Idempotente.

-- ── 1. La question, posée par équipe ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pool_composition_closed_for(p_entry_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry public.pool_entries%ROWTYPE;
BEGIN
  SELECT * INTO v_entry FROM public.pool_entries WHERE id = p_entry_id;
  -- Inconnue : fermé. Ne jamais ouvrir sur une absence de réponse.
  IF NOT FOUND THEN RETURN TRUE; END IF;

  IF v_entry.is_locked THEN RETURN TRUE; END IF;

  -- Jamais confirmée une seule fois : elle n'a jamais participé.
  IF v_entry.confirmed_at IS NULL THEN RETURN FALSE; END IF;

  RETURN public.pool_composition_closed(v_entry.season_id);
END $$;

GRANT EXECUTE ON FUNCTION public.pool_composition_closed_for(BIGINT) TO anon, authenticated;

COMMENT ON FUNCTION public.pool_composition_closed_for(BIGINT) IS
  'Vrai quand CETTE équipe ne peut plus composer librement. Une inscription jamais confirmée (confirmed_at NULL) reste ouverte malgré le début du pool : une seule chance de se terminer.';

-- ── 2. L'appliquer ────────────────────────────────────────────────────────
-- Corps de 00130 à l'identique, la garde passant de la saison à l'équipe.
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

  IF public.pool_composition_closed_for(p_entry_id) THEN
    RAISE EXCEPTION 'Le pool est commencé — la composition est fermée. Les changements se font maintenant par échange, et un joueur n''est échangeable qu''après % match(s) disputés pour toi, ou s''il ne joue pas.',
      v_season.trade_min_games;
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _picks (player_id BIGINT PRIMARY KEY, slot_position TEXT)
    ON COMMIT DROP;
  DELETE FROM _picks;
  INSERT INTO _picks (player_id, slot_position)
  SELECT DISTINCT ON ((x->>'player_id')::BIGINT)
         (x->>'player_id')::BIGINT, x->>'slot_position'
  FROM jsonb_array_elements(p_picks) x;

  SELECT COALESCE(SUM(pp.price_cents - rs.price_cents), 0) INTO v_drift
  FROM public.pool_roster_slots rs
  JOIN _picks k ON k.player_id = rs.player_id
  JOIN public.pool_player_prices pp
    ON pp.season_id = v_entry.season_id AND pp.player_id = rs.player_id
  WHERE rs.entry_id = p_entry_id AND rs.effective_to IS NULL;

  DELETE FROM public.pool_roster_slots rs
   WHERE rs.entry_id = p_entry_id
     AND rs.effective_to IS NULL
     AND NOT EXISTS (SELECT 1 FROM _picks k WHERE k.player_id = rs.player_id);

  UPDATE public.pool_roster_slots rs
     SET price_cents = pp.price_cents,
         slot_position = k.slot_position
    FROM _picks k, public.pool_player_prices pp
   WHERE rs.entry_id = p_entry_id
     AND rs.effective_to IS NULL
     AND k.player_id = rs.player_id
     AND pp.season_id = v_entry.season_id
     AND pp.player_id = rs.player_id;

  INSERT INTO public.pool_roster_slots (entry_id, player_id, slot_position)
  SELECT p_entry_id, k.player_id, k.slot_position
  FROM _picks k
  WHERE NOT EXISTS (
    SELECT 1 FROM public.pool_roster_slots rs
     WHERE rs.entry_id = p_entry_id AND rs.effective_to IS NULL AND rs.player_id = k.player_id
  );

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

  UPDATE public.pool_entries e SET
    star_forward_id = CASE WHEN EXISTS (SELECT 1 FROM public.pool_roster_slots rs
      WHERE rs.entry_id = e.id AND rs.effective_to IS NULL AND rs.player_id = e.star_forward_id) THEN e.star_forward_id ELSE NULL END,
    star_defense_id = CASE WHEN EXISTS (SELECT 1 FROM public.pool_roster_slots rs
      WHERE rs.entry_id = e.id AND rs.effective_to IS NULL AND rs.player_id = e.star_defense_id) THEN e.star_defense_id ELSE NULL END
  WHERE e.id = p_entry_id;

  UPDATE public.pool_entries SET spent_cents = v_spent, is_confirmed = FALSE, updated_at = NOW() WHERE id = p_entry_id;
END $$;

GRANT EXECUTE ON FUNCTION public.pool_save_roster(BIGINT, JSONB) TO authenticated;

-- ── Vérification ──────────────────────────────────────────────────────────
-- Qui peut encore composer, et qui est passé aux échanges :
--   SELECT e.team_name, e.is_confirmed, e.confirmed_at,
--          public.pool_composition_closed_for(e.id) AS fermee
--   FROM public.pool_entries e
--   WHERE e.season_id = 1
--   ORDER BY fermee, e.team_name;
--
-- Attendu : fermee = false uniquement pour les inscriptions dont
-- confirmed_at est NULL.
