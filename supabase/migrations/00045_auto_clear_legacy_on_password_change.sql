-- Prevent the legacy-login endpoint from overwriting a user's current bcrypt
-- password with their old MD5 password.
--
-- Scenario we're fixing:
--   1. User X was imported from Zone Nordiques with a random bcrypt password.
--   2. User X used "Forgot password" and set a new bcrypt password `NEW`.
--   3. User X's legacy_password_hash (MD5 of their OLD Zone Nordiques password
--      `OLD`) is still stored in members_private.
--   4. User X accidentally types `OLD` on login. Standard signIn fails (bcrypt
--      no longer matches). Legacy-login matches the MD5 and — without this
--      trigger — would overwrite `NEW` with `OLD`, losing the new password.
--
-- Fix: whenever auth.users.encrypted_password changes (register, admin update,
--      reset password, etc.), clear legacy_password_hash and set
--      password_migrated = true for that user. The legacy-login endpoint
--      already refuses to act when either of those is set, so once a user has
--      knowingly set their password, they are permanently off the legacy path.

CREATE OR REPLACE FUNCTION public.clear_legacy_hash_on_password_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
    UPDATE public.members_private
    SET legacy_password_hash = NULL,
        password_migrated = TRUE
    WHERE member_id = NEW.id
      AND (legacy_password_hash IS NOT NULL OR password_migrated = FALSE);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_legacy_hash_on_password_change ON auth.users;
CREATE TRIGGER trg_clear_legacy_hash_on_password_change
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_legacy_hash_on_password_change();

-- Retroactive cleanup: any user that has already signed in at least once
-- AFTER their account was created (last_sign_in_at > created_at + 1 minute)
-- has a working bcrypt password. Mark them as migrated and drop their legacy
-- hash so that typing their old MD5 password can never overwrite the new one.
UPDATE public.members_private mp
SET legacy_password_hash = NULL,
    password_migrated = TRUE
FROM auth.users au
WHERE au.id = mp.member_id
  AND au.last_sign_in_at IS NOT NULL
  AND au.last_sign_in_at > au.created_at + INTERVAL '1 minute'
  AND (mp.legacy_password_hash IS NOT NULL OR mp.password_migrated = FALSE);
