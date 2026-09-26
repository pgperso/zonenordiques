-- Pool LNH — name the player the pool refuses, and say why.
--
-- "Joueur 8481461 non disponible pour cette saison" tells a member nothing.
-- They cannot look 8481461 up, they do not know which of their eighteen picks
-- it is, and the only way to find out was to remove players one at a time.
--
-- The message now gives the name and the reason, which are two different
-- things: a player with no salary yet is waiting on the owner, while a player
-- deliberately retired from the season is not coming back. A member who reads
-- the first can ask for a price; a member who reads the second knows to move
-- on.
--
-- Same checks, same failures — only the wording changes.
--
-- Idempotent.

CREATE OR REPLACE FUNCTION public.pool_slot_validate()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_season_id BIGINT;
  v_locked    BOOLEAN;
  v_lock_at   TIMESTAMPTZ;
  v_price     public.pool_player_prices%ROWTYPE;
  v_name      TEXT;
BEGIN
  SELECT e.season_id, e.is_locked, s.lock_at
    INTO v_season_id, v_locked, v_lock_at
  FROM public.pool_entries e
  JOIN public.pool_seasons s ON s.id = e.season_id
  WHERE e.id = NEW.entry_id;

  -- Lock check applies to client/builder writes; trusted RPCs (transactions)
  -- legitimately edit a locked roster and set the privileged flag.
  IF NOT public.pool_is_privileged()
     AND (v_locked OR (v_lock_at IS NOT NULL AND NOW() >= v_lock_at)) THEN
    RAISE EXCEPTION 'Alignement verrouillé — modification impossible';
  END IF;

  SELECT full_name INTO v_name FROM public.nhl_players WHERE player_id = NEW.player_id;
  v_name := COALESCE(v_name, 'Joueur ' || NEW.player_id);

  SELECT * INTO v_price FROM public.pool_player_prices
  WHERE season_id = v_season_id AND player_id = NEW.player_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '% n''a pas de prix pour cette saison — il ne peut pas être repêché.', v_name;
  END IF;
  IF NOT v_price.is_draftable THEN
    -- price_cents = 0 is the "no salary yet" marker from 00117.
    IF v_price.price_cents = 0 THEN
      RAISE EXCEPTION '% n''a pas encore de salaire — il sera repêchable quand l''administrateur lui en aura donné un.', v_name;
    END IF;
    RAISE EXCEPTION '% n''est pas disponible cette saison — retire-le de ton alignement.', v_name;
  END IF;
  IF v_price.position <> NEW.slot_position THEN
    RAISE EXCEPTION '% joue à la position % et ne peut pas occuper une place de %.',
      v_name, v_price.position, NEW.slot_position;
  END IF;

  NEW.price_cents := v_price.price_cents;
  RETURN NEW;
END $$;

-- The trigger itself is unchanged (BEFORE INSERT, from 00068); replacing the
-- function is enough.

-- ── Verification ──────────────────────────────────────────────────────────
-- Everyone currently rostered on a price nobody verified — the members who
-- will meet these messages:
--   SELECT DISTINCT np.full_name, np.team_abbrev, pp.position, pp.is_draftable,
--          ROUND(pp.price_cents/1e8, 2) AS prix_m
--   FROM public.pool_roster_slots rs
--   JOIN public.pool_entries e ON e.id = rs.entry_id AND e.season_id = 1
--   JOIN public.pool_player_prices pp
--     ON pp.season_id = e.season_id AND pp.player_id = rs.player_id
--   JOIN public.nhl_players np ON np.player_id = rs.player_id
--   WHERE rs.effective_to IS NULL AND pp.imported_at IS NULL
--   ORDER BY np.full_name;
