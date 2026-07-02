-- Pool LNH — team price (= top goalie salary) counted in the cap, + team stats.
--
--  * pool_team_price(season, team) = the highest goalie cap hit on that NHL
--    team. The chosen team costs that much and it counts in the salary cap.
--  * pool_team_season view = per-team season stats (GP, GF, GA, W, L), the
--    pool points the team has produced, and its price — for display like a
--    player's stat line.
--  * pool_save_roster / pool_set_team / pool_confirm_entry now include the
--    team price in spent_cents and the budget check.

CREATE OR REPLACE FUNCTION public.pool_team_price(p_season_id BIGINT, p_team TEXT)
RETURNS BIGINT LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(MAX(pp.price_cents), 0)
  FROM public.pool_player_prices pp
  JOIN public.nhl_players np ON np.player_id = pp.player_id
  WHERE pp.season_id = p_season_id AND np.team_abbrev = p_team AND np.position = 'G';
$$;

CREATE OR REPLACE VIEW public.pool_team_season AS
SELECT
  ps.id AS pool_season_id,
  nt.abbrev AS team_abbrev,
  COALESCE(nt.full_name, nt.name) AS name,
  public.pool_team_price(ps.id, nt.abbrev) AS price_cents,
  COALESCE(s.gp, 0)     AS gp,
  COALESCE(s.gf, 0)     AS gf,
  COALESCE(s.ga, 0)     AS ga,
  COALESCE(s.wins, 0)   AS wins,
  COALESCE(s.losses, 0) AS losses,
  COALESCE(tp.pts, 0)   AS team_points
FROM public.pool_seasons ps
CROSS JOIN public.nhl_teams nt
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS gp, SUM(u.gf) AS gf, SUM(u.ga) AS ga,
         COUNT(*) FILTER (WHERE u.gf > u.ga) AS wins,
         COUNT(*) FILTER (WHERE u.gf < u.ga) AS losses
  FROM public.nhl_games g
  CROSS JOIN LATERAL (VALUES
    (g.home_abbrev, g.home_score, g.away_score),
    (g.away_abbrev, g.away_score, g.home_score)
  ) AS u(abbrev, gf, ga)
  WHERE u.abbrev = nt.abbrev AND g.season = ps.nhl_season
    AND g.game_type = ANY (ps.game_types) AND g.game_state IN ('OFF', 'FINAL')
) s ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(pts) AS pts FROM public.pool_team_game_points
  WHERE pool_season_id = ps.id AND team_abbrev = nt.abbrev
) tp ON TRUE;

GRANT SELECT ON public.pool_team_season TO anon, authenticated;

-- ── RPCs now fold the team price into spent_cents + the budget check ────────

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

  v_spent := v_spent + public.pool_team_price(v_entry.season_id, v_entry.team_pick);

  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;
  IF v_f > v_season.roster_f OR v_d > v_season.roster_d OR v_g > v_season.roster_g THEN
    RAISE EXCEPTION 'Trop de joueurs (F:% D:% G:%)', v_f, v_d, v_g;
  END IF;

  UPDATE public.pool_entries SET spent_cents = v_spent, is_confirmed = FALSE, updated_at = NOW() WHERE id = p_entry_id;
END $$;

CREATE OR REPLACE FUNCTION public.pool_set_team(p_entry_id BIGINT, p_team TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entry public.pool_entries%ROWTYPE; v_season public.pool_seasons%ROWTYPE; v_spent BIGINT;
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

  SELECT COALESCE(SUM(price_cents),0) INTO v_spent
  FROM public.pool_roster_slots WHERE entry_id = p_entry_id AND effective_to IS NULL;
  v_spent := v_spent + public.pool_team_price(v_entry.season_id, p_team);
  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Cette équipe fait dépasser le budget (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;

  UPDATE public.pool_entries
     SET team_pick = p_team, spent_cents = v_spent, is_confirmed = FALSE, updated_at = NOW()
   WHERE id = p_entry_id;
END $$;

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
  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;

  UPDATE public.pool_entries SET is_confirmed = TRUE, confirmed_at = NOW(), updated_at = NOW() WHERE id = p_entry_id;
END $$;
