-- Pool LNH — saving a roster must never be blocked by a player already on it.
--
-- 00117 made every player without a verified salary undraftable. That is the
-- rule and it stands — but it also caught players who were ALREADY on members'
-- rosters, drafted back when the derived placeholder prices made everyone
-- available. Those members then could not save at all:
--
--   "Joueur 8484144 non disponible pour cette saison"
--
-- because pool_save_roster deletes the whole roster and re-inserts it, so the
-- INSERT trigger re-validates players the member never touched. The salary
-- import already protects rostered players when it retires someone; this makes
-- the roster save behave the same way.
--
-- The fix is not to weaken the rule but to apply it where it belongs.
-- Draftability governs what you may ADD. Keeping what you already have is not
-- an act of drafting, and a member cannot be held responsible for a price the
-- owner has not filled in yet.
--
-- So the save becomes differential: remove what left, insert what arrived,
-- and re-price what stayed. Only the arrivals go through the trigger. It is
-- also less work — an untouched 18-man roster now writes nothing at all
-- instead of 18 deletes and 18 inserts.
--
-- Re-pricing the kept slots preserves "le prix du jour, pour tous" (00112):
-- a member who saves gets today's prices on their whole roster, exactly as
-- before, just without deleting it first.
--
-- Idempotent.

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
  IF v_season.lock_at IS NOT NULL AND NOW() >= v_season.lock_at THEN
    RAISE EXCEPTION 'La période de composition est terminée';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _picks (player_id BIGINT PRIMARY KEY, slot_position TEXT)
    ON COMMIT DROP;
  DELETE FROM _picks;
  INSERT INTO _picks (player_id, slot_position)
  SELECT DISTINCT ON ((x->>'player_id')::BIGINT)
         (x->>'player_id')::BIGINT, x->>'slot_position'
  FROM jsonb_array_elements(p_picks) x;

  -- How much the kept players moved, measured before anything is written.
  SELECT COALESCE(SUM(pp.price_cents - rs.price_cents), 0) INTO v_drift
  FROM public.pool_roster_slots rs
  JOIN _picks k ON k.player_id = rs.player_id
  JOIN public.pool_player_prices pp
    ON pp.season_id = v_entry.season_id AND pp.player_id = rs.player_id
  WHERE rs.entry_id = p_entry_id AND rs.effective_to IS NULL;

  -- 1. Players the member dropped.
  DELETE FROM public.pool_roster_slots rs
   WHERE rs.entry_id = p_entry_id
     AND rs.effective_to IS NULL
     AND NOT EXISTS (SELECT 1 FROM _picks k WHERE k.player_id = rs.player_id);

  -- 2. Players the member kept: today's price, and whatever slot they now
  --    occupy. No INSERT, so the draftability trigger never sees them.
  UPDATE public.pool_roster_slots rs
     SET price_cents = pp.price_cents,
         slot_position = k.slot_position
    FROM _picks k, public.pool_player_prices pp
   WHERE rs.entry_id = p_entry_id
     AND rs.effective_to IS NULL
     AND k.player_id = rs.player_id
     AND pp.season_id = v_entry.season_id
     AND pp.player_id = rs.player_id;

  -- 3. Players the member added. These ARE drafting, so they are validated:
  --    an undraftable player still cannot be picked up.
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

  -- Drop stars that are no longer rostered.
  UPDATE public.pool_entries e SET
    star_forward_id = CASE WHEN EXISTS (SELECT 1 FROM public.pool_roster_slots rs
      WHERE rs.entry_id = e.id AND rs.effective_to IS NULL AND rs.player_id = e.star_forward_id) THEN e.star_forward_id ELSE NULL END,
    star_defense_id = CASE WHEN EXISTS (SELECT 1 FROM public.pool_roster_slots rs
      WHERE rs.entry_id = e.id AND rs.effective_to IS NULL AND rs.player_id = e.star_defense_id) THEN e.star_defense_id ELSE NULL END
  WHERE e.id = p_entry_id;

  UPDATE public.pool_entries SET spent_cents = v_spent, is_confirmed = FALSE, updated_at = NOW() WHERE id = p_entry_id;
END $$;

GRANT EXECUTE ON FUNCTION public.pool_save_roster(BIGINT, JSONB) TO authenticated;

-- ── Verification ──────────────────────────────────────────────────────────
-- Who is currently rostered on a price nobody verified — the members this was
-- blocking. Giving them a salary in "Joueurs sans salaire" clears the row;
-- until then, their owners can at least save again.
--   SELECT DISTINCT np.full_name, np.team_abbrev, pp.position,
--          ROUND(pp.price_cents/1e8, 2) AS prix_m
--   FROM public.pool_roster_slots rs
--   JOIN public.pool_entries e ON e.id = rs.entry_id AND e.season_id = 1
--   JOIN public.pool_player_prices pp
--     ON pp.season_id = e.season_id AND pp.player_id = rs.player_id
--   JOIN public.nhl_players np ON np.player_id = rs.player_id
--   WHERE rs.effective_to IS NULL AND pp.imported_at IS NULL
--   ORDER BY np.full_name;
