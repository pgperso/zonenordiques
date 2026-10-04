-- Pool LNH — un joueur ajouté après le début de la saison entre à sa date.
--
-- pool_roster_slots.effective_from vaut '0001-01-01' par défaut (00068), et
-- pool_save_roster ne l'a jamais renseignée. C'était juste tant que la seule
-- façon d'ajouter un joueur était le repêchage initial : il est effectivement
-- dans l'alignement depuis le début. Ça cesse de l'être dès que la saison est
-- commencée, et deux règles s'en trouvent faussées :
--
--  * Les points. pool_refresh_standings ne compte un match que s'il a été joué
--    pendant la possession. Avec '0001-01-01', un joueur ramassé hier rapporte
--    toute sa saison — choisi en connaissant déjà ses résultats.
--
--  * Les échanges. pool_games_on_roster compte les matchs disputés depuis
--    rs.effective_from. Avec '0001-01-01', un joueur ajouté hier affiche déjà
--    ses 5 matchs et devient échangeable sur-le-champ, alors que la règle du
--    commissaire est « 5 matchs depuis que je l'ai, pas depuis le début de la
--    saison ».
--
-- pool_make_transaction, lui, a toujours inscrit la bonne date. C'est donc
-- uniquement le chemin du composeur qui manquait — resté ouvert cinq jours
-- faute de lock_at, et encore ouvert pour les inscriptions jamais confirmées
-- (00131), qui composeraient aujourd'hui avec effet rétroactif.
--
-- La date retenue est celle de pool_make_transaction, pour que les deux
-- chemins se comportent pareil : aujourd'hui, ou demain si un match du jour
-- est déjà commencé — on ne rejoint pas une partie en cours.
--
-- Avant le premier match, '0001-01-01' est conservé : là, « depuis toujours »
-- est vrai, et c'est ce qui fait qu'un repêchage normal compte au complet.
--
-- Corps de 00131 à l'identique hormis l'INSERT. Idempotente.

CREATE OR REPLACE FUNCTION public.pool_save_roster(p_entry_id BIGINT, p_picks JSONB)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry public.pool_entries%ROWTYPE; v_season public.pool_seasons%ROWTYPE;
  v_spent BIGINT; v_f INT; v_d INT; v_g INT;
  v_drift BIGINT;
  v_started BOOLEAN;
  v_today DATE;
  v_join  DATE;
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

  -- La date d'entrée des NOUVEAUX joueurs.
  SELECT EXISTS (
    SELECT 1 FROM public.nhl_games g
    WHERE g.season = v_season.nhl_season
      AND g.game_type = ANY (v_season.game_types)
      AND g.start_time_utc <= NOW()
  ) INTO v_started;

  IF v_started THEN
    v_today := (NOW() AT TIME ZONE v_season.timezone)::date;
    -- Même protection que pour un échange : on ne rejoint pas une partie déjà
    -- commencée, sinon l'ajout récolterait des points déjà au tableau.
    IF EXISTS (
      SELECT 1 FROM public.nhl_games g
      WHERE g.game_date = v_today
        AND (g.start_time_utc <= NOW() OR g.game_state NOT IN ('FUT', 'PRE'))
    ) THEN
      v_join := v_today + 1;
    ELSE
      v_join := v_today;
    END IF;
  ELSE
    v_join := '0001-01-01'::date;
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

  -- Les joueurs conservés gardent leur date d'entrée : ils n'arrivent pas,
  -- ils restent. Seul le prix du jour leur est réappliqué (00112).
  UPDATE public.pool_roster_slots rs
     SET price_cents = pp.price_cents,
         slot_position = k.slot_position
    FROM _picks k, public.pool_player_prices pp
   WHERE rs.entry_id = p_entry_id
     AND rs.effective_to IS NULL
     AND k.player_id = rs.player_id
     AND pp.season_id = v_entry.season_id
     AND pp.player_id = rs.player_id;

  -- Le changement : les arrivées sont datées.
  INSERT INTO public.pool_roster_slots (entry_id, player_id, slot_position, effective_from)
  SELECT p_entry_id, k.player_id, k.slot_position, v_join
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
-- Les joueurs qui portent encore « depuis toujours » alors que leur slot a été
-- créé après le premier match. created_at est un indice, pas une preuve :
-- avant 00121, chaque sauvegarde effaçait et réinsérait TOUT l'alignement, ce
-- qui a redaté created_at pour des joueurs présents depuis le repêchage. À
-- lire, pas à corriger en bloc.
--
--   SELECT e.team_name, np.full_name, rs.created_at,
--          public.pool_games_on_roster(e.id, rs.player_id) AS mj_comptes
--   FROM public.pool_roster_slots rs
--   JOIN public.pool_entries e ON e.id = rs.entry_id AND e.season_id = 1
--   JOIN public.nhl_players np ON np.player_id = rs.player_id
--   WHERE rs.effective_to IS NULL
--     AND rs.effective_from = '0001-01-01'
--     AND rs.created_at > (SELECT MIN(g.start_time_utc) FROM public.nhl_games g
--                           WHERE g.season = 20262027 AND g.game_type = 2)
--   ORDER BY e.team_name, rs.created_at DESC;
