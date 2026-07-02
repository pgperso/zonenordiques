-- ============================================================
-- COMBINED MIGRATIONS 00008-00018 (Arena v2) — IDEMPOTENT
-- Safe to re-run: uses IF NOT EXISTS, DROP IF EXISTS, DO blocks.
-- Copy-paste into Supabase SQL Editor and run.
-- ============================================================


-- ============================================================
-- 00008: Enrich chat_messages for social feed
-- ============================================================

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS repost_of_id BIGINT REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_of_id BIGINT REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reply_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repost_count INT DEFAULT 0;

ALTER TABLE public.chat_messages ALTER COLUMN content DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.chat_messages
    ADD CONSTRAINT chk_message_has_content
    CHECK (content IS NOT NULL OR repost_of_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_chat_messages_parent ON public.chat_messages(parent_id)
  WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_repost ON public.chat_messages(repost_of_id)
  WHERE repost_of_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_quote ON public.chat_messages(quote_of_id)
  WHERE quote_of_id IS NOT NULL;


-- ============================================================
-- 00009: Message likes with denormalized counter
-- ============================================================

CREATE TABLE IF NOT EXISTS public.message_likes (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_message_likes_message ON public.message_likes(message_id);
CREATE INDEX IF NOT EXISTS idx_message_likes_member ON public.message_likes(member_id);

CREATE OR REPLACE FUNCTION update_message_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.chat_messages SET like_count = like_count + 1 WHERE id = NEW.message_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.chat_messages SET like_count = like_count - 1 WHERE id = OLD.message_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_message_like_count ON public.message_likes;
CREATE TRIGGER trg_message_like_count
AFTER INSERT OR DELETE ON public.message_likes
FOR EACH ROW EXECUTE FUNCTION update_message_like_count();

ALTER TABLE public.message_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Message likes are publicly readable" ON public.message_likes;
CREATE POLICY "Message likes are publicly readable"
  ON public.message_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can like messages" ON public.message_likes;
CREATE POLICY "Authenticated users can like messages"
  ON public.message_likes FOR INSERT
  WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "Members can unlike their own likes" ON public.message_likes;
CREATE POLICY "Members can unlike their own likes"
  ON public.message_likes FOR DELETE
  USING (auth.uid() = member_id);


-- ============================================================
-- 00010: Articles + article likes
-- ============================================================

CREATE TABLE IF NOT EXISTS public.articles (
  id SERIAL PRIMARY KEY,
  community_id INT NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  excerpt TEXT,
  body TEXT NOT NULL,
  cover_image_url TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  like_count INT DEFAULT 0,
  view_count INT DEFAULT 0,
  is_removed BOOLEAN DEFAULT FALSE,
  removed_at TIMESTAMPTZ,
  removed_by UUID REFERENCES public.members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(community_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_articles_community_published ON public.articles(community_id, published_at DESC)
  WHERE is_published = TRUE AND is_removed = FALSE;
CREATE INDEX IF NOT EXISTS idx_articles_author ON public.articles(author_id);

CREATE TABLE IF NOT EXISTS public.article_likes (
  id BIGSERIAL PRIMARY KEY,
  article_id INT NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(article_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_article_likes_article ON public.article_likes(article_id);

CREATE OR REPLACE FUNCTION update_article_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.articles SET like_count = like_count + 1 WHERE id = NEW.article_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.articles SET like_count = like_count - 1 WHERE id = OLD.article_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_article_like_count ON public.article_likes;
CREATE TRIGGER trg_article_like_count
AFTER INSERT OR DELETE ON public.article_likes
FOR EACH ROW EXECUTE FUNCTION update_article_like_count();

-- Add articles to realtime (ignore if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.articles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Published articles are publicly readable" ON public.articles;
CREATE POLICY "Published articles are publicly readable"
  ON public.articles FOR SELECT
  USING (is_published = TRUE AND is_removed = FALSE);

DROP POLICY IF EXISTS "Authors can read own drafts" ON public.articles;
CREATE POLICY "Authors can read own drafts"
  ON public.articles FOR SELECT
  USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "Privileged members can insert articles" ON public.articles;
CREATE POLICY "Privileged members can insert articles"
  ON public.articles FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.community_id = articles.community_id
        AND cmr.member_id = auth.uid()
        AND r.code IN ('admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "Authors can update own articles" ON public.articles;
CREATE POLICY "Authors can update own articles"
  ON public.articles FOR UPDATE
  USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "Moderators can update any article" ON public.articles;
CREATE POLICY "Moderators can update any article"
  ON public.articles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.community_id = articles.community_id
        AND cmr.member_id = auth.uid()
        AND r.code IN ('admin', 'moderator')
    )
  );

ALTER TABLE public.article_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Article likes are publicly readable" ON public.article_likes;
CREATE POLICY "Article likes are publicly readable"
  ON public.article_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can like articles" ON public.article_likes;
CREATE POLICY "Authenticated users can like articles"
  ON public.article_likes FOR INSERT
  WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "Members can unlike their own article likes" ON public.article_likes;
CREATE POLICY "Members can unlike their own article likes"
  ON public.article_likes FOR DELETE
  USING (auth.uid() = member_id);


-- ============================================================
-- 00011: Enrich podcasts + podcast likes
-- ============================================================

ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0;

-- Add podcasts to realtime (ignore if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.podcasts;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.podcast_likes (
  id BIGSERIAL PRIMARY KEY,
  podcast_id INT NOT NULL REFERENCES public.podcasts(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(podcast_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_podcast_likes_podcast ON public.podcast_likes(podcast_id);

CREATE OR REPLACE FUNCTION update_podcast_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.podcasts SET like_count = like_count + 1 WHERE id = NEW.podcast_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.podcasts SET like_count = like_count - 1 WHERE id = OLD.podcast_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_podcast_like_count ON public.podcast_likes;
CREATE TRIGGER trg_podcast_like_count
AFTER INSERT OR DELETE ON public.podcast_likes
FOR EACH ROW EXECUTE FUNCTION update_podcast_like_count();

ALTER TABLE public.podcast_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Podcast likes are publicly readable" ON public.podcast_likes;
CREATE POLICY "Podcast likes are publicly readable"
  ON public.podcast_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can like podcasts" ON public.podcast_likes;
CREATE POLICY "Authenticated users can like podcasts"
  ON public.podcast_likes FOR INSERT
  WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "Members can unlike their own podcast likes" ON public.podcast_likes;
CREATE POLICY "Members can unlike their own podcast likes"
  ON public.podcast_likes FOR DELETE
  USING (auth.uid() = member_id);


-- ============================================================
-- 00012: Counter triggers (reply_count, repost_count)
-- ============================================================

CREATE OR REPLACE FUNCTION update_message_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE public.chat_messages SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE public.chat_messages SET reply_count = reply_count - 1 WHERE id = OLD.parent_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_message_reply_count ON public.chat_messages;
CREATE TRIGGER trg_message_reply_count
AFTER INSERT OR DELETE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION update_message_reply_count();

CREATE OR REPLACE FUNCTION update_message_repost_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.repost_of_id IS NOT NULL THEN
      UPDATE public.chat_messages SET repost_count = repost_count + 1 WHERE id = NEW.repost_of_id;
    END IF;
    IF NEW.quote_of_id IS NOT NULL THEN
      UPDATE public.chat_messages SET repost_count = repost_count + 1 WHERE id = NEW.quote_of_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.repost_of_id IS NOT NULL THEN
      UPDATE public.chat_messages SET repost_count = repost_count - 1 WHERE id = OLD.repost_of_id;
    END IF;
    IF OLD.quote_of_id IS NOT NULL THEN
      UPDATE public.chat_messages SET repost_count = repost_count - 1 WHERE id = OLD.quote_of_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_message_repost_count ON public.chat_messages;
CREATE TRIGGER trg_message_repost_count
AFTER INSERT OR DELETE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION update_message_repost_count();


-- ============================================================
-- 00013: Article permission for admin/moderator roles
-- ============================================================

INSERT INTO public.role_permissions (role_id, permission)
VALUES
  ((SELECT id FROM public.roles WHERE code = 'admin'), 'article:publish'),
  ((SELECT id FROM public.roles WHERE code = 'moderator'), 'article:publish')
ON CONFLICT (role_id, permission) DO NOTHING;


-- ============================================================
-- 00014: Fix RLS policies (r.name -> r.code)
-- ============================================================

DROP POLICY IF EXISTS "Moderators can update chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Authors and moderators can update chat messages" ON public.chat_messages;

CREATE POLICY "Authors and moderators can update chat messages"
  ON public.chat_messages FOR UPDATE
  USING (
    auth.uid() = member_id
    OR EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND cmr.community_id = chat_messages.community_id
        AND r.code IN ('admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "Restrictions are publicly readable" ON public.member_restrictions;
DROP POLICY IF EXISTS "Restrictions readable by moderators and self" ON public.member_restrictions;

CREATE POLICY "Restrictions readable by moderators and self"
  ON public.member_restrictions FOR SELECT
  USING (
    auth.uid() = member_id
    OR EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND cmr.community_id = member_restrictions.community_id
        AND r.code IN ('admin', 'moderator')
    )
  );


-- ============================================================
-- 00015: Rate limiting on chat messages
-- ============================================================

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_message_rate ON public.chat_messages;
CREATE TRIGGER enforce_message_rate
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.check_message_rate();


-- ============================================================
-- 00016: Storage bucket policies
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access for chat images" ON storage.objects;
CREATE POLICY "Public read access for chat images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "Authenticated users can upload chat images" ON storage.objects;
CREATE POLICY "Authenticated users can upload chat images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-images'
    AND auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Users can delete own chat images" ON storage.objects;
CREATE POLICY "Users can delete own chat images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chat-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('article-covers', 'article-covers', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read access for article covers" ON storage.objects;
CREATE POLICY "Public read access for article covers"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'article-covers');

DROP POLICY IF EXISTS "Authenticated users can upload article covers" ON storage.objects;
CREATE POLICY "Authenticated users can upload article covers"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'article-covers'
    AND auth.uid() IS NOT NULL
  );


-- ============================================================
-- 00017: Security hardening (RLS, RPC, rate limiting, checks)
-- ============================================================

DROP POLICY IF EXISTS "Moderators can insert restrictions" ON public.member_restrictions;
CREATE POLICY "Moderators can insert restrictions"
  ON public.member_restrictions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND cmr.community_id = member_restrictions.community_id
        AND r.code IN ('admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "Moderators can delete restrictions" ON public.member_restrictions;
CREATE POLICY "Moderators can delete restrictions"
  ON public.member_restrictions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND cmr.community_id = member_restrictions.community_id
        AND r.code IN ('admin', 'moderator')
    )
  );

DROP POLICY IF EXISTS "Admins can insert roles" ON public.community_member_roles;
CREATE POLICY "Admins can insert roles"
  ON public.community_member_roles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_member_roles cmr2
      JOIN public.roles r ON r.id = cmr2.role_id
      WHERE cmr2.member_id = auth.uid()
        AND cmr2.community_id = community_member_roles.community_id
        AND r.code = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete roles" ON public.community_member_roles;
CREATE POLICY "Admins can delete roles"
  ON public.community_member_roles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.community_member_roles cmr2
      JOIN public.roles r ON r.id = cmr2.role_id
      WHERE cmr2.member_id = auth.uid()
        AND cmr2.community_id = community_member_roles.community_id
        AND r.code = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION increment_article_views(p_article_id INT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE articles SET view_count = view_count + 1 WHERE id = p_article_id;
$$;

CREATE OR REPLACE FUNCTION check_like_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  recent_count INT;
BEGIN
  EXECUTE format(
    'SELECT COUNT(*) FROM %I WHERE member_id = $1 AND created_at > now() - interval ''30 seconds''',
    TG_TABLE_NAME
  ) INTO recent_count USING NEW.member_id;

  IF recent_count >= 30 THEN
    RAISE EXCEPTION 'Rate limit exceeded: too many likes in 30 seconds';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_message_like_rate ON public.message_likes;
CREATE TRIGGER check_message_like_rate
  BEFORE INSERT ON public.message_likes
  FOR EACH ROW EXECUTE FUNCTION check_like_rate();

DROP TRIGGER IF EXISTS check_article_like_rate ON public.article_likes;
CREATE TRIGGER check_article_like_rate
  BEFORE INSERT ON public.article_likes
  FOR EACH ROW EXECUTE FUNCTION check_like_rate();

DROP TRIGGER IF EXISTS check_podcast_like_rate ON public.podcast_likes;
CREATE TRIGGER check_podcast_like_rate
  BEFORE INSERT ON public.podcast_likes
  FOR EACH ROW EXECUTE FUNCTION check_like_rate();

DO $$ BEGIN
  ALTER TABLE public.member_restrictions
    ADD CONSTRAINT valid_restriction_type
    CHECK (restriction_type IN ('chat:mute', 'community:ban'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.chat_messages
    ADD CONSTRAINT valid_message_length
    CHECK (content IS NULL OR char_length(content) <= 1000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ============================================================
-- 00018: Enforce mute/ban at DB level + harden functions
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can send chat messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Authenticated users can send chat messages (not muted)" ON public.chat_messages;

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

DROP POLICY IF EXISTS "Authenticated users can join communities" ON public.community_members;
DROP POLICY IF EXISTS "Authenticated users can join communities (not banned)" ON public.community_members;

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

DROP POLICY IF EXISTS "Members are publicly readable" ON public.members;
DROP POLICY IF EXISTS "Members can read own full profile" ON public.members;
DROP POLICY IF EXISTS "Members public profile readable" ON public.members;
DROP POLICY IF EXISTS "Members can only insert own row" ON public.members;

CREATE POLICY "Members can read own full profile"
  ON public.members FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Members public profile readable"
  ON public.members FOR SELECT
  USING (true);

CREATE POLICY "Members can only insert own row"
  ON public.members FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Override increment_article_views with auth check
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

-- Fix check_message_rate to use SECURITY INVOKER (default)
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

DO $$ BEGIN
  ALTER TABLE public.articles
    ADD CONSTRAINT valid_article_body_length
    CHECK (char_length(body) <= 100000);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Sanitize username in handle_new_user trigger
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _username TEXT;
BEGIN
  _username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1)
  );
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
