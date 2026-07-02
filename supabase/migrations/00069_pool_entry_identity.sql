-- Pool LNH — team identity (name + logo).
--
-- Lets a member name their team and pick a logo. The logo is a URL (we use
-- the 32 NHL team logos from nhl_teams, but any URL works). Renaming is
-- allowed any time via an RPC — even after the roster locks — so the
-- is_locked RLS restriction on direct updates doesn't block identity edits.

ALTER TABLE public.pool_entries ADD COLUMN IF NOT EXISTS team_logo TEXT;

CREATE OR REPLACE FUNCTION public.pool_set_identity(p_entry_id BIGINT, p_name TEXT, p_logo TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID;
BEGIN
  SELECT member_id INTO v_owner FROM public.pool_entries WHERE id = p_entry_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Inscription introuvable'; END IF;
  IF v_owner <> auth.uid() THEN RAISE EXCEPTION 'Non autorisé'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'Le nom d''équipe est requis'; END IF;
  IF length(trim(p_name)) > 40 THEN RAISE EXCEPTION 'Nom trop long (max 40)'; END IF;

  UPDATE public.pool_entries
     SET team_name = trim(p_name), team_logo = p_logo, updated_at = NOW()
   WHERE id = p_entry_id;
END $$;

GRANT EXECUTE ON FUNCTION public.pool_set_identity(BIGINT, TEXT, TEXT) TO authenticated;
