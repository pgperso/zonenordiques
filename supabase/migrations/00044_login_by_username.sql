-- Allow login by username OR email.
--
-- Context: the site was historically a username+password forum (Zone Nordiques).
-- When users were imported into Supabase Auth, accounts were created with their
-- email, but most users only remember their username. This RPC resolves a
-- username back to its email so the login form can still accept usernames.
--
-- Security:
--   - SECURITY DEFINER so the function can read auth.users (which is locked
--     down from normal roles).
--   - Only returns the email for the given username — never enumerates.
--   - Available to the anon role because login happens BEFORE authentication.
--   - Returns NULL if the username is not found (caller must handle).

CREATE OR REPLACE FUNCTION public.get_email_from_username(uname TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  result_email TEXT;
  member_id UUID;
BEGIN
  -- Trim + case-insensitive match on members.username
  uname := lower(trim(uname));
  IF uname IS NULL OR length(uname) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO member_id
  FROM public.members
  WHERE lower(username) = uname
  LIMIT 1;

  IF member_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT email INTO result_email
  FROM auth.users
  WHERE id = member_id;

  RETURN result_email;
END;
$$;

-- Anon + authenticated roles must be able to call this (login happens from anon).
GRANT EXECUTE ON FUNCTION public.get_email_from_username(TEXT) TO anon, authenticated;
