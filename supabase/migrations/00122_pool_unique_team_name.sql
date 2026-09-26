-- Pool LNH — two teams in the same season may not share a name.
--
-- The standings, the chat bar and the bot announcements all name a team and
-- nothing else. Two "Les Élites" and nobody can tell who is leading, including
-- the two members concerned.
--
-- Compared case- and space-insensitively, because "les elites", "Les Élites "
-- and "LES ELITES" are the same name to every reader. Accents are left alone:
-- folding them needs the unaccent extension, and a member who deliberately
-- writes "Les Elites" next to "Les Élites" is being difficult on purpose
-- rather than colliding by accident.
--
-- Scoped to the season: a name is free again next year.
--
-- Idempotent.

-- ── 1. Refuse to run on data that already breaks the rule ────────────────
-- A bare CREATE UNIQUE INDEX would fail with "could not create unique index"
-- and a duplicate key value, which says nothing about whose team to rename.
DO $$
DECLARE v_dups TEXT;
BEGIN
  SELECT string_agg(format('saison %s : « %s » (%s fois)', season_id, sample, n), E'\n')
    INTO v_dups
  FROM (
    SELECT season_id, MIN(team_name) AS sample, COUNT(*) AS n
    FROM public.pool_entries
    GROUP BY season_id, lower(trim(team_name))
    HAVING COUNT(*) > 1
  ) d;

  IF v_dups IS NOT NULL THEN
    RAISE EXCEPTION E'Des noms d''équipe sont déjà en double — renomme-les avant d''appliquer cette migration :\n%', v_dups;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pool_entries_team_name
  ON public.pool_entries (season_id, lower(trim(team_name)));

-- ── 2. A name a member can act on, not a constraint violation ────────────
CREATE OR REPLACE FUNCTION public.pool_set_identity(p_entry_id BIGINT, p_name TEXT, p_logo TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID; v_season BIGINT;
BEGIN
  SELECT member_id, season_id INTO v_owner, v_season
  FROM public.pool_entries WHERE id = p_entry_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Inscription introuvable'; END IF;
  IF v_owner <> auth.uid() THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'Le nom d''équipe est requis'; END IF;
  IF length(trim(p_name)) > 40 THEN RAISE EXCEPTION 'Nom trop long (max 40)'; END IF;

  -- Checked here for the message, enforced by the index for the race: two
  -- members submitting the same name at the same moment both pass this test,
  -- and the second one is stopped by the constraint.
  IF EXISTS (
    SELECT 1 FROM public.pool_entries
    WHERE season_id = v_season
      AND id <> p_entry_id
      AND lower(trim(team_name)) = lower(trim(p_name))
  ) THEN
    RAISE EXCEPTION 'Ce nom d''équipe est déjà pris — choisis-en un autre.';
  END IF;

  BEGIN
    UPDATE public.pool_entries
       SET team_name = trim(p_name), team_logo = p_logo, updated_at = NOW()
     WHERE id = p_entry_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Ce nom d''équipe vient d''être pris — choisis-en un autre.';
  END;
END $$;

GRANT EXECUTE ON FUNCTION public.pool_set_identity(BIGINT, TEXT, TEXT) TO authenticated;

-- ── Verification ──────────────────────────────────────────────────────────
-- Expect 0 rows:
--   SELECT season_id, lower(trim(team_name)), COUNT(*)
--   FROM public.pool_entries GROUP BY 1, 2 HAVING COUNT(*) > 1;
