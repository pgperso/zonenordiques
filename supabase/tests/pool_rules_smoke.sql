-- Pool LNH — end-to-end smoke test, played as a member would play it.
--
-- HOW IT WORKS, and why it is safe to run on production:
--
--   Everything happens inside one DO block. The block ends by raising an
--   exception on purpose, which aborts the transaction, so every row it
--   created or changed is undone — no test entry survives, no member's roster
--   is touched, nothing lands in the standings.
--
--   The report comes back AS that exception's message. So a red "ERROR:" box
--   in the SQL editor is the expected, successful outcome: read its text.
--
--   plpgsql variables are memory, not table rows, so the log survives the
--   rollbacks. Each negative test sits in its own sub-block, whose rollback
--   undoes only that failed attempt.
--
-- What it plays: the member signs up, tries an impossible roster, builds a
-- legal one, picks a club, confirms, locks, and tries to trade a player who
-- has not played yet.
--
-- Run it in the Supabase SQL editor. Read every line: a step that says
-- INATTENDU is a real problem.

DO $$
DECLARE
  v_log      text[] := '{}';
  v_season   public.pool_seasons%ROWTYPE;
  v_member   uuid;
  v_entry    bigint;
  v_picks    jsonb;
  v_team     text;
  v_spent    bigint;
  v_spent2   bigint;   -- a salary mass in cents overflows int4
  v_slots    int;
  v_n        int;
  v_msg      text;
BEGIN
  SELECT * INTO v_season FROM public.pool_seasons ORDER BY nhl_season DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aucune saison de pool.'; END IF;

  v_log := v_log || format('SAISON %s (id %s) — statut %s', v_season.nhl_season, v_season.id, v_season.status);
  v_log := v_log || format('  alignement : %s att / %s déf / %s gard / %s équipe(s)',
                           v_season.roster_f, v_season.roster_d, v_season.roster_g, v_season.roster_teams);
  v_log := v_log || format('  plafond : %s M$ · verrouillage : %s',
                           round(v_season.budget_cents/1e8, 1), COALESCE(v_season.lock_at::text, 'aucun'));
  -- Read dynamically: touching v_season.trade_min_games directly would abort
  -- the whole script with "record has no field" when 00115 has not been run,
  -- which is exactly the case this test exists to report.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'pool_seasons'
                AND column_name = 'trade_min_games') THEN
    EXECUTE format('SELECT trade_min_games FROM public.pool_seasons WHERE id = %s', v_season.id) INTO v_n;
    v_log := v_log || format('  échanges : %s · max %s · min matchs avant échange : %s',
                             v_season.transactions_enabled, v_season.max_transactions, v_n);
  ELSE
    v_n := -1;
    v_log := v_log || format('  échanges : %s · max %s · règle des matchs ABSENTE (00115 non passée)',
                             v_season.transactions_enabled, v_season.max_transactions);
  END IF;
  v_log := v_log || '';

  -- Draftable inventory. A pool that cannot fill one roster is not playable,
  -- and that is exactly what the unpriced defencemen caused earlier.
  SELECT COUNT(*) INTO v_n FROM public.pool_player_prices
   WHERE season_id = v_season.id AND is_draftable AND position = 'F';
  v_log := v_log || format('INVENTAIRE  attaquants repêchables : %s (besoin %s) → %s',
                           v_n, v_season.roster_f, CASE WHEN v_n >= v_season.roster_f THEN 'ok' ELSE 'INSUFFISANT' END);
  SELECT COUNT(*) INTO v_n FROM public.pool_player_prices
   WHERE season_id = v_season.id AND is_draftable AND position = 'D';
  v_log := v_log || format('            défenseurs repêchables : %s (besoin %s) → %s',
                           v_n, v_season.roster_d, CASE WHEN v_n >= v_season.roster_d THEN 'ok' ELSE 'INSUFFISANT' END);
  SELECT COUNT(*) INTO v_n FROM public.pool_player_prices
   WHERE season_id = v_season.id AND is_draftable AND position = 'G';
  v_log := v_log || format('            gardiens repêchables  : %s (besoin %s) → %s',
                           v_n, v_season.roster_g, CASE WHEN v_n >= v_season.roster_g THEN 'ok' ELSE 'INSUFFISANT' END);

  SELECT COUNT(*) INTO v_n FROM public.pool_player_prices
   WHERE season_id = v_season.id AND is_draftable AND imported_at IS NULL;
  v_log := v_log || format('            repêchables sans vrai salaire : %s → %s',
                           v_n, CASE WHEN v_n = 0 THEN 'ok' ELSE 'INATTENDU (00117 devrait l''interdire)' END);
  v_log := v_log || '';

  -- The team pick must be free (00114).
  SELECT abbrev INTO v_team FROM public.nhl_teams ORDER BY abbrev LIMIT 1;
  v_log := v_log || format('ÉQUIPE GRATUITE  prix de %s : %s M$ → %s', v_team,
                           round(public.pool_team_price(v_season.id, v_team)/1e8, 2),
                           CASE WHEN public.pool_team_price(v_season.id, v_team) = 0
                                THEN 'ok' ELSE 'INATTENDU (00114 non passée)' END);
  v_log := v_log || '';

  BEGIN
    PERFORM set_config('pool.privileged', '1', true);

    -- ── The member signs up ────────────────────────────────────────────────
    SELECT m.id INTO v_member FROM public.members m
     WHERE NOT EXISTS (SELECT 1 FROM public.pool_entries e
                        WHERE e.season_id = v_season.id AND e.member_id = m.id)
     LIMIT 1;
    IF v_member IS NULL THEN RAISE EXCEPTION 'Tous les membres ont déjà une inscription — impossible de tester.'; END IF;

    INSERT INTO public.pool_entries (season_id, member_id, team_name)
    VALUES (v_season.id, v_member, 'ÉQUIPE DE TEST (annulée)')
    RETURNING id INTO v_entry;
    v_log := v_log || format('INSCRIPTION  créée (id %s) → ok', v_entry);

    -- ── He tries to buy the most expensive roster in the league ────────────
    SELECT jsonb_agg(x) INTO v_picks FROM (
      (SELECT jsonb_build_object('player_id', player_id, 'slot_position', 'F') AS x
         FROM public.pool_player_prices
        WHERE season_id = v_season.id AND is_draftable AND position = 'F'
        ORDER BY price_cents DESC LIMIT v_season.roster_f)
      UNION ALL
      (SELECT jsonb_build_object('player_id', player_id, 'slot_position', 'D')
         FROM public.pool_player_prices
        WHERE season_id = v_season.id AND is_draftable AND position = 'D'
        ORDER BY price_cents DESC LIMIT v_season.roster_d)
    ) q;
    BEGIN
      PERFORM public.pool_save_roster(v_entry, v_picks);
      v_log := v_log || 'BUDGET       alignement le plus cher ACCEPTÉ → INATTENDU, le plafond ne bloque rien';
    EXCEPTION WHEN OTHERS THEN
      v_log := v_log || format('BUDGET       alignement le plus cher refusé → ok (%s)', SQLERRM);
    END;

    -- ── He tries one forward too many ──────────────────────────────────────
    SELECT jsonb_agg(jsonb_build_object('player_id', player_id, 'slot_position', 'F')) INTO v_picks
      FROM (SELECT player_id FROM public.pool_player_prices
             WHERE season_id = v_season.id AND is_draftable AND position = 'F'
             ORDER BY price_cents ASC LIMIT v_season.roster_f + 1) q;
    BEGIN
      PERFORM public.pool_save_roster(v_entry, v_picks);
      v_log := v_log || 'EFFECTIF     un attaquant de trop ACCEPTÉ → INATTENDU';
    EXCEPTION WHEN OTHERS THEN
      v_log := v_log || format('EFFECTIF     un attaquant de trop refusé → ok (%s)', SQLERRM);
    END;

    -- ── He builds a legal, affordable roster ───────────────────────────────
    SELECT jsonb_agg(x) INTO v_picks FROM (
      (SELECT jsonb_build_object('player_id', player_id, 'slot_position', 'F') AS x
         FROM public.pool_player_prices
        WHERE season_id = v_season.id AND is_draftable AND position = 'F'
        ORDER BY price_cents ASC LIMIT v_season.roster_f)
      UNION ALL
      (SELECT jsonb_build_object('player_id', player_id, 'slot_position', 'D')
         FROM public.pool_player_prices
        WHERE season_id = v_season.id AND is_draftable AND position = 'D'
        ORDER BY price_cents ASC LIMIT v_season.roster_d)
      UNION ALL
      (SELECT jsonb_build_object('player_id', player_id, 'slot_position', 'G')
         FROM public.pool_player_prices
        WHERE season_id = v_season.id AND is_draftable AND position = 'G'
        ORDER BY price_cents ASC LIMIT v_season.roster_g)
    ) q;
    PERFORM public.pool_save_roster(v_entry, v_picks);

    SELECT spent_cents INTO v_spent FROM public.pool_entries WHERE id = v_entry;
    SELECT COUNT(*) INTO v_slots FROM public.pool_roster_slots
     WHERE entry_id = v_entry AND effective_to IS NULL;
    v_log := v_log || format('ALIGNEMENT   %s joueurs enregistrés, masse %s M$ / %s M$ → %s',
                             v_slots, round(v_spent/1e8, 1), round(v_season.budget_cents/1e8, 1),
                             CASE WHEN v_spent <= v_season.budget_cents THEN 'ok' ELSE 'INATTENDU' END);

    -- ── The club pick must not cost him anything ──────────────────────────
    IF v_season.roster_teams > 0 THEN
      PERFORM public.pool_set_team(v_entry, v_team);
      SELECT spent_cents INTO v_spent2 FROM public.pool_entries WHERE id = v_entry;
      v_log := v_log || format('ÉQUIPE       %s choisie, masse %s M$ → %s', v_team, round(v_spent2/1e8, 1),
                               CASE WHEN v_spent2 = v_spent THEN 'ok, gratuite' ELSE 'INATTENDU, elle a coûté quelque chose' END);
    END IF;

    -- ── He confirms ────────────────────────────────────────────────────────
    BEGIN
      PERFORM public.pool_confirm_entry(v_entry);
      v_log := v_log || 'CONFIRMATION acceptée → ok';
    EXCEPTION WHEN OTHERS THEN
      v_log := v_log || format('CONFIRMATION refusée → %s', SQLERRM);
    END;

    -- ── The draft closes ───────────────────────────────────────────────────
    BEGIN
      PERFORM public.pool_lock_entry(v_entry);
      v_log := v_log || 'VERROUILLAGE accepté → ok';
    EXCEPTION WHEN OTHERS THEN
      v_log := v_log || format('VERROUILLAGE refusé → %s', SQLERRM);
    END;

    -- ── He tries to trade a player who has not played for him yet ─────────
    IF NOT v_season.transactions_enabled THEN
      v_log := v_log || 'ÉCHANGE      désactivé pour la saison — règle des 5 matchs non testable';
    ELSIF v_season.max_transactions = 0 THEN
      v_log := v_log || 'ÉCHANGE      max_transactions = 0 — règle des 5 matchs non testable';
    ELSE
      BEGIN
        PERFORM public.pool_make_transaction(
          v_entry,
          (SELECT player_id FROM public.pool_roster_slots
            WHERE entry_id = v_entry AND effective_to IS NULL AND slot_position = 'F' LIMIT 1),
          (SELECT pp.player_id FROM public.pool_player_prices pp
            WHERE pp.season_id = v_season.id AND pp.is_draftable AND pp.position = 'F'
              AND NOT EXISTS (SELECT 1 FROM public.pool_roster_slots rs
                               WHERE rs.entry_id = v_entry AND rs.player_id = pp.player_id)
            ORDER BY pp.price_cents ASC LIMIT 1));
        v_log := v_log || 'ÉCHANGE      accepté alors que le joueur n''a disputé aucun match → INATTENDU si 00115 est passée';
      EXCEPTION WHEN OTHERS THEN
        v_log := v_log || format('ÉCHANGE      refusé → %s', SQLERRM);
      END;
    END IF;

    -- ── The stored mass must equal the slots ──────────────────────────────
    SELECT spent_cents INTO v_spent FROM public.pool_entries WHERE id = v_entry;
    SELECT COALESCE(SUM(price_cents), 0) INTO v_spent2 FROM public.pool_roster_slots
     WHERE entry_id = v_entry AND effective_to IS NULL;
    v_log := v_log || format('COHÉRENCE    masse stockée %s M$ vs somme des joueurs %s M$ → %s',
                             round(v_spent/1e8, 1), round(v_spent2/1e8, 1),
                             CASE WHEN v_spent = v_spent2 THEN 'ok' ELSE 'INATTENDU' END);

    RAISE EXCEPTION 'FIN_DES_TESTS';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'FIN_DES_TESTS' THEN
      v_log := v_log || format('!! SCÉNARIO INTERROMPU : %s', v_msg);
    END IF;
  END;

  v_log := v_log || '';
  v_log := v_log || '(tout a été annulé — aucune inscription de test ne subsiste)';
  RAISE EXCEPTION E'\n%', array_to_string(v_log, E'\n');
END $$;
