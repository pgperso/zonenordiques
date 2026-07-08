-- ============================================================
-- 00089: Bound the unique-username loop in handle_new_user
--
-- 00084's WHILE loop was bounded only by the number of existing members
-- (4607 imported). A very common base name could iterate many times on
-- every signup. Cap the suffix search at 100, then fall back to a
-- guaranteed-unique username derived from the new user's UUID.
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
  _base := substring(regexp_replace(_base, '[^a-zA-Z0-9_-]', '', 'g') FROM 1 FOR 50);
  IF length(_base) < 3 THEN
    _base := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;

  -- Try the base, then _1.._100.
  _username := _base;
  WHILE _suffix < 100 AND EXISTS (SELECT 1 FROM public.members WHERE username = _username) LOOP
    _suffix := _suffix + 1;
    _username := substring(_base FROM 1 FOR 40) || '_' || _suffix::text;
  END LOOP;

  -- Guaranteed-unique fallback (UUID-derived) so signup can never hang.
  IF EXISTS (SELECT 1 FROM public.members WHERE username = _username) THEN
    _username := 'user_' || substr(replace(NEW.id::text, '-', ''), 1, 16);
  END IF;

  INSERT INTO public.members (id, username)
  VALUES (NEW.id, _username);

  INSERT INTO public.members_private (member_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (member_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
