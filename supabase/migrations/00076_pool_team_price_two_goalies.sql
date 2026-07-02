-- Pool LNH — team price is now the TOTAL of the team's two official goalies
-- (the two highest cap hits), not just the single highest. The view and the
-- three budget RPCs all call pool_team_price(), so replacing the function
-- propagates everywhere automatically.

CREATE OR REPLACE FUNCTION public.pool_team_price(p_season_id BIGINT, p_team TEXT)
RETURNS BIGINT LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(SUM(price_cents), 0) FROM (
    SELECT pp.price_cents
    FROM public.pool_player_prices pp
    JOIN public.nhl_players np ON np.player_id = pp.player_id
    WHERE pp.season_id = p_season_id AND np.team_abbrev = p_team AND np.position = 'G'
    ORDER BY pp.price_cents DESC
    LIMIT 2
  ) top2;
$$;
