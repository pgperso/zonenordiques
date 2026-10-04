-- Pool LNH — la composition se ferme toute seule au premier match.
--
-- Le composeur bascule en mode « Échanger » dès que la composition est
-- fermée : il refuse d'ajouter ou de retirer, charge pool_trade_eligibility et
-- n'autorise qu'un échange à la fois, sous la règle des 5 matchs (00115).
-- Tout ça existe depuis 00115 et n'a jamais servi, parce que la fermeture
-- dépendait d'une seule valeur :
--
--   isLocked = season.lockAt && new Date(season.lockAt) <= new Date()
--
-- et lock_at n'a jamais été rempli. Résultat : cinq jours de saison pendant
-- lesquels n'importe qui pouvait retirer et reprendre autant de joueurs qu'il
-- voulait, en voyant déjà leurs points. Personne n'a rien fait de mal — rien
-- ne le leur interdisait.
--
-- Remplir lock_at réglerait aujourd'hui et se réoublierait l'an prochain. La
-- fermeture est donc dérivée d'un fait, pas d'un réglage : le pool ferme au
-- premier match de la saison. lock_at reste honoré s'il est rempli, pour une
-- échéance PLUS HÂTIVE que la première mise au jeu — un vrai jour de
-- repêchage, par exemple.
--
-- Idempotente.

-- ── 1. Le fait : la composition est-elle fermée ? ─────────────────────────
CREATE OR REPLACE FUNCTION public.pool_composition_closed(p_season_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_season public.pool_seasons%ROWTYPE;
  v_first  TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_season FROM public.pool_seasons WHERE id = p_season_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Une échéance explicite gagne : c'est un choix du commissaire, et il peut
  -- légitimement vouloir fermer avant la première mise au jeu.
  IF v_season.lock_at IS NOT NULL THEN
    RETURN NOW() >= v_season.lock_at;
  END IF;

  SELECT MIN(g.start_time_utc) INTO v_first
  FROM public.nhl_games g
  WHERE g.season = v_season.nhl_season
    AND g.game_type = ANY (v_season.game_types);

  RETURN v_first IS NOT NULL AND NOW() >= v_first;
END $$;

-- Le composeur doit pouvoir poser la question avant d'afficher ses boutons.
-- Les saisons et le calendrier sont déjà publics en lecture, ça n'expose rien.
GRANT EXECUTE ON FUNCTION public.pool_composition_closed(BIGINT) TO anon, authenticated;

COMMENT ON FUNCTION public.pool_composition_closed(BIGINT) IS
  'Vrai quand la composition libre est terminée : à lock_at s''il est rempli, sinon au premier match de la saison. Au-delà, les changements passent par pool_make_transaction et sa règle des 5 matchs.';

-- ── 2. L'appliquer ────────────────────────────────────────────────────────
-- Corps de 00121 à l'identique — sauvegarde différentielle, dérive des prix,
-- vedettes orphelines — avec la seule garde de fermeture remplacée.
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

  -- Le changement : la fermeture vient du calendrier, plus d'un réglage.
  IF public.pool_composition_closed(v_entry.season_id) THEN
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

-- ── 3. Ouvrir les échanges, sinon on gèle tout le monde ───────────────────
-- Fermer la composition pendant que transactions_enabled est faux et que
-- max_transactions vaut 0 laisserait chaque pooler sans AUCUN moyen de bouger
-- son alignement de la saison. Les deux changements ne peuvent pas être
-- séparés.
--
-- Pas de quota : la règle du commissaire est « seulement après 5 matchs
-- disputés, ou s'il ne joue pas ». C'est la seule restriction voulue, donc
-- max_transactions est mis hors d'atteinte plutôt que supprimé — la colonne
-- reste là si un plafond devient souhaitable.
UPDATE public.pool_seasons
   SET transactions_enabled = TRUE,
       max_transactions     = GREATEST(max_transactions, 999)
 WHERE lock_at IS NULL OR NOW() >= lock_at;

-- ── Vérification ──────────────────────────────────────────────────────────
-- A) La composition est-elle fermée, et les échanges ouverts ?
--      SELECT public.pool_composition_closed(id) AS fermee,
--             transactions_enabled, max_transactions, trade_min_games
--      FROM public.pool_seasons WHERE id = 1;
--
-- B) Qui peut échanger qui, dans une équipe donnée :
--      SELECT np.full_name, t.games_played, t.games_required, t.is_out, t.can_trade
--      FROM public.pool_trade_eligibility(5) t
--      JOIN public.nhl_players np ON np.player_id = t.player_id
--      ORDER BY t.can_trade DESC, np.full_name;
