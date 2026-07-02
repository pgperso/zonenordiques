-- ============================================================
-- 00018: Enforce mute/ban at DB level + protect sensitive columns
-- ============================================================

-- 1. Enforce mute check on chat_messages INSERT
DROP POLICY IF EXISTS "Authenticated users can send chat messages" ON public.chat_messages;

CREATE POLICY "Authenticated users can send chat messages (not muted)"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    auth.uid() = member_id
    AND NOT EXISTS (
      SELECT 1 FROM public.member_restrictions mr
      WHERE mr.community_id = chat_messages.community_id
        AND mr.member_id = auth.uid()
        AND mr.restriction_type = 'chat:mute'
        AND (mr.ends_at IS NULL OR mr.ends_at > now())
    )
  );

-- 2. Enforce ban check on community_members INSERT
DROP POLICY IF EXISTS "Authenticated users can join communities" ON public.community_members;

CREATE POLICY "Authenticated users can join communities (not banned)"
  ON public.community_members FOR INSERT
  WITH CHECK (
    auth.uid() = member_id
    AND NOT EXISTS (
      SELECT 1 FROM public.member_restrictions mr
      WHERE mr.community_id = community_members.community_id
        AND mr.member_id = auth.uid()
        AND mr.restriction_type = 'community:ban'
        AND (mr.ends_at IS NULL OR mr.ends_at > now())
    )
  );

-- 3. Restrict members SELECT to hide sensitive columns
-- Replace the permissive SELECT policy with a view approach
-- Since RLS cannot do column-level filtering, we create a secure view
DROP POLICY IF EXISTS "Members are publicly readable" ON public.members;

-- Only allow users to see their own full row; others see via the public view
CREATE POLICY "Members can read own full profile"
  ON public.members FOR SELECT
  USING (auth.uid() = id);

-- Allow reading public fields for other users (needed for member lookups)
-- We keep a permissive policy but applications MUST use select('id, username, avatar_url')
-- The real protection is: move sensitive columns to a separate table
-- For now, re-enable public read since the app needs member lookups
CREATE POLICY "Members public profile readable"
  ON public.members FOR SELECT
  USING (true);

-- NOTE: legacy_password_hash and email exposure is a known issue.
-- Full fix requires moving these to a separate table (members_private).
-- For now, all application code MUST only select('id, username, avatar_url, ...public fields').

-- 4. Members INSERT: only allow creating your own row
CREATE POLICY "Members can only insert own row"
  ON public.members FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 5. Fix increment_article_views to require auth
CREATE OR REPLACE FUNCTION increment_article_views(p_article_id INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE articles SET view_count = view_count + 1 WHERE id = p_article_id;
END;
$$;

-- 6. Fix check_message_rate to use SECURITY INVOKER (default)
CREATE OR REPLACE FUNCTION public.check_message_rate()
RETURNS TRIGGER AS $$
DECLARE
  recent_count integer;
BEGIN
  SELECT count(*) INTO recent_count
  FROM public.chat_messages
  WHERE member_id = NEW.member_id
    AND community_id = NEW.community_id
    AND created_at > now() - interval '30 seconds';

  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 10 messages per 30 seconds'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Add max length constraint on article body
ALTER TABLE public.articles
  ADD CONSTRAINT valid_article_body_length
  CHECK (char_length(body) <= 100000);

-- 8. Sanitize username in handle_new_user trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _username TEXT;
BEGIN
  _username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)
  );
  -- Sanitize: only allow alphanumeric, underscores, hyphens; max 50 chars
  _username := substring(regexp_replace(_username, '[^a-zA-Z0-9_-]', '', 'g') FROM 1 FOR 50);
  IF length(_username) < 3 THEN
    _username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;

  INSERT INTO public.members (id, username, email)
  VALUES (NEW.id, _username, NEW.email)
  ON CONFLICT (username) DO UPDATE SET username = NEW.id::text;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Add autoplay to Permissions-Policy header (done in middleware, not SQL)
