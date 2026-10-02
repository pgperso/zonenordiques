-- Pool LNH — ramener une équipe au début du pool.
--
-- pool_refresh_standings ne compte un match que s'il a été joué PENDANT que le
-- joueur était dans l'alignement :
--
--   AND pgp.game_date >= GREATEST(rs.effective_from, COALESCE(e.effective_from, …))
--
-- C'est la bonne règle pour un échange — on ne récolte pas les points d'un
-- joueur qu'on vient d'acquérir. Mais l'alignement INITIAL n'a jamais été
-- échangé, et sa date d'entrée a été réécrite par un effet de bord : jusqu'à la
-- migration 00121, pool_save_roster faisait DELETE puis INSERT de tous les
-- slots (00068, l.178), si bien que chaque sauvegarde redatait l'alignement
-- complet au jour de la sauvegarde. Un pooler qui a retouché son équipe après
-- le premier match a donc perdu les soirées précédentes — sa page affiche
-- 5 points au tableau et 0 à l'entête, sans que rien n'explique l'écart.
--
-- Cette fonction est l'outil du commissaire pour réparer ça : elle ramène la
-- date d'entrée d'une équipe (et de son alignement courant) au premier soir
-- comptabilisé de la saison, puis recalcule le classement.
--
-- Elle REFUSE d'agir sur une équipe qui a fait un échange : là, les dates de
-- slots portent une information réelle et les réécrire donnerait des points
-- pour des matchs joués avant l'acquisition. Mieux vaut un refus explicite
-- qu'une correction silencieuse qui fausse le pool.
--
-- Réservée au service_role : le commissaire l'exécute depuis l'éditeur SQL.
-- Idempotente — la relancer sur une équipe déjà ramenée ne change rien.

CREATE OR REPLACE FUNCTION public.pool_backdate_entry(
  p_entry_id BIGINT,
  p_from     DATE DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry   public.pool_entries%ROWTYPE;
  v_from    DATE;
  v_trades  INT;
  v_slots   INT;
  v_before  NUMERIC;
  v_after   NUMERIC;
BEGIN
  SELECT * INTO v_entry FROM public.pool_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucune équipe de pool avec l''identifiant %', p_entry_id;
  END IF;

  -- Par défaut, le premier soir où le pool a compté des points. Pas la date du
  -- premier match de la LNH : ce qui compte est ce que le pool a ingéré.
  v_from := COALESCE(p_from, (
    SELECT MIN(game_date) FROM public.pool_player_game_points
     WHERE pool_season_id = v_entry.season_id
  ));
  IF v_from IS NULL THEN
    RETURN format('Aucun match comptabilisé pour la saison %s — rien à ramener.',
                  v_entry.season_id);
  END IF;

  SELECT COUNT(*) INTO v_trades
    FROM public.pool_transactions WHERE entry_id = p_entry_id;
  IF v_trades > 0 THEN
    RAISE EXCEPTION
      '« % » a fait % échange(s). Les dates de ses joueurs sont réelles : les réécrire lui donnerait les points de matchs joués avant l''acquisition. Corrige les slots concernés à la main.',
      v_entry.team_name, v_trades;
  END IF;

  SELECT COALESCE(fantasy_points, 0) INTO v_before
    FROM public.pool_standings WHERE entry_id = p_entry_id;

  UPDATE public.pool_roster_slots
     SET effective_from = v_from
   WHERE entry_id = p_entry_id
     AND effective_to IS NULL
     AND effective_from > v_from;
  GET DIAGNOSTICS v_slots = ROW_COUNT;

  -- effective_from est une colonne protégée par trg_pool_entry_guard (00068) :
  -- un écrivain ordinaire ne peut pas la toucher, c'est le but. Les fonctions
  -- du pool lèvent ce drapeau le temps de leur écriture. Le troisième argument
  -- le rend local à la transaction, donc il ne fuit pas hors d'ici — et on le
  -- rabaisse tout de suite après, pour que le recalcul du classement qui suit
  -- ne tourne pas privilégié sans raison.
  PERFORM set_config('pool.privileged', '1', true);
  UPDATE public.pool_entries
     SET effective_from = LEAST(COALESCE(effective_from, v_from), v_from)
   WHERE id = p_entry_id;
  PERFORM set_config('pool.privileged', '0', true);

  -- p_live => TRUE : préserve previous_rank. Une correction administrative
  -- n'est pas une soirée de hockey — sans ce drapeau, les flèches ↑↓ des
  -- treize équipes afficheraient un mouvement qui n'a jamais eu lieu sur la
  -- glace, et le bot le commenterait le soir même.
  PERFORM public.pool_refresh_standings(v_entry.season_id, TRUE);

  SELECT COALESCE(fantasy_points, 0) INTO v_after
    FROM public.pool_standings WHERE entry_id = p_entry_id;

  RETURN format('« %s » ramenée au %s : %s joueur(s) redatés, %s pt → %s pt.',
                v_entry.team_name, v_from, v_slots,
                COALESCE(v_before, 0), COALESCE(v_after, 0));
END $$;

REVOKE EXECUTE ON FUNCTION public.pool_backdate_entry(BIGINT, DATE) FROM anon, authenticated;

COMMENT ON FUNCTION public.pool_backdate_entry(BIGINT, DATE) IS
  'Outil du commissaire : ramène la date d''entrée d''une équipe et de son alignement courant au premier soir comptabilisé, puis recalcule le classement. Refuse si l''équipe a fait un échange.';

-- ── Utilisation ───────────────────────────────────────────────────────────
-- Voir ce qui serait corrigé, sans rien changer :
--   SELECT e.id, e.team_name, MIN(rs.effective_from) AS depart,
--          COALESCE(st.fantasy_points, 0) AS pts
--   FROM public.pool_entries e
--   LEFT JOIN public.pool_roster_slots rs
--          ON rs.entry_id = e.id AND rs.effective_to IS NULL
--   LEFT JOIN public.pool_standings st ON st.entry_id = e.id
--   WHERE e.season_id = 1 AND e.is_confirmed
--   GROUP BY e.id, e.team_name, st.fantasy_points
--   HAVING MIN(rs.effective_from) > (
--     SELECT MIN(game_date) FROM public.pool_player_game_points WHERE pool_season_id = 1)
--   ORDER BY e.team_name;
--
-- Une équipe :
--   SELECT public.pool_backdate_entry(<id>);
--
-- Toutes celles que la requête ci-dessus a listées :
--   SELECT public.pool_backdate_entry(id)
--   FROM public.pool_entries WHERE season_id = 1 AND is_confirmed;
