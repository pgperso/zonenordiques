-- ============================================================
-- 00021: Security hardening + performance indexes + storage
-- ============================================================

-- ============================================
-- 1. Move sensitive columns to members_private
-- ============================================

CREATE TABLE IF NOT EXISTS public.members_private (
  member_id UUID PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  email TEXT,
  legacy_password_hash TEXT,
  password_migrated BOOLEAN DEFAULT FALSE
);

-- Migrate existing data
INSERT INTO public.members_private (member_id, email, legacy_password_hash, password_migrated)
SELECT id, email, legacy_password_hash, password_migrated
FROM public.members
ON CONFLICT (member_id) DO NOTHING;

-- Drop sensitive columns from public members table
ALTER TABLE public.members
  DROP COLUMN IF EXISTS legacy_password_hash,
  DROP COLUMN IF EXISTS password_migrated,
  DROP COLUMN IF EXISTS email;

-- RLS on members_private: only own data
ALTER TABLE public.members_private ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own private data"
  ON public.members_private FOR SELECT
  USING (auth.uid() = member_id);

CREATE POLICY "Users can update own private data"
  ON public.members_private FOR UPDATE
  USING (auth.uid() = member_id);

-- ============================================
-- 2. Update handle_new_user trigger
--    (no longer inserts email into members)
-- ============================================

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

  -- Insert public profile (no email)
  INSERT INTO public.members (id, username)
  VALUES (NEW.id, _username)
  ON CONFLICT (username) DO UPDATE SET username = NEW.id::text;

  -- Insert private data (email)
  INSERT INTO public.members_private (member_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (member_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Rate limiting indexes (CRITICAL for perf)
-- ============================================

-- Message rate limit: check_message_rate() scans (member_id, community_id, created_at)
CREATE INDEX IF NOT EXISTS idx_chat_messages_rate
  ON public.chat_messages(member_id, community_id, created_at DESC);

-- Like rate limit: check_like_rate() scans (member_id, created_at) per table
CREATE INDEX IF NOT EXISTS idx_message_likes_rate
  ON public.message_likes(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_likes_rate
  ON public.article_likes(member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_podcast_likes_rate
  ON public.podcast_likes(member_id, created_at DESC);

-- Partial index for active podcasts in feed queries
CREATE INDEX IF NOT EXISTS idx_podcasts_community_active
  ON public.podcasts(community_id, created_at DESC)
  WHERE is_published = TRUE AND (is_removed = FALSE OR is_removed IS NULL);

-- ============================================
-- 4. Storage bucket restrictions
-- ============================================

UPDATE storage.buckets SET
  file_size_limit = 10485760, -- 10 MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'chat-images';

UPDATE storage.buckets SET
  file_size_limit = 5242880, -- 5 MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
WHERE id = 'article-covers';

-- ============================================
-- 5. Bot bypass for rate limiting
-- ============================================

CREATE OR REPLACE FUNCTION public.check_message_rate()
RETURNS TRIGGER AS $$
DECLARE
  recent_count integer;
BEGIN
  -- Skip rate limit for TribuneBot
  IF NEW.member_id = '00000000-0000-0000-0000-000000000001' THEN
    RETURN NEW;
  END IF;

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
