-- ============================================================
-- 00084: Fix "Database error saving new user" on signup
--
-- Root cause: handle_new_user() used
--   INSERT INTO members (id, username) VALUES (NEW.id, _username)
--   ON CONFLICT (username) DO UPDATE SET username = NEW.id::text;
-- When the derived username collides with an existing (migrated)
-- member, ON CONFLICT DO UPDATE rewrites the EXISTING row instead of
-- the new one, so NO members row is created for NEW.id. The following
-- INSERT into members_private (member_id -> members.id FK) then fails
-- with a foreign-key violation, aborting the whole signup.
--
-- With 4607 imported members, common usernames are already taken, so
-- signups with those names always crashed.
--
-- Fix: derive a GUARANTEED-UNIQUE username (append a numeric suffix
-- when taken) and insert a proper members row for NEW.id.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _base     TEXT;
  _username TEXT;
  _suffix   INT := 0;
BEGIN
  _base := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)
  );
  -- Sanitize: only alphanumeric, underscores, hyphens; max 50 chars
  _base := substring(regexp_replace(_base, '[^a-zA-Z0-9_-]', '', 'g') FROM 1 FOR 50);
  IF length(_base) < 3 THEN
    _base := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;

  -- Ensure uniqueness: append _1, _2, ... until free (kept under 50 chars)
  _username := _base;
  WHILE EXISTS (SELECT 1 FROM public.members WHERE username = _username) LOOP
    _suffix := _suffix + 1;
    _username := substring(_base FROM 1 FOR 45) || '_' || _suffix::text;
  END LOOP;

  -- Public profile (no email) — always for the NEW user's id
  INSERT INTO public.members (id, username)
  VALUES (NEW.id, _username);

  -- Private data (email)
  INSERT INTO public.members_private (member_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (member_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
