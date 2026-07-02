-- ============================================================
-- 00037: Fix Supabase Security Advisor warnings
--   1. SET search_path = public on ALL functions (Function Search Path Mutable)
--   2. Fix RLS Always True on exposmetre_votes DELETE + nordiquometre_votes
-- ============================================================

-- ============================================
-- 1. FIX FUNCTION SEARCH PATH MUTABLE
--    Re-create all functions with SET search_path = public
-- ============================================

-- 1a. update_community_member_count
CREATE OR REPLACE FUNCTION update_community_member_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.communities SET member_count = member_count + 1 WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.communities SET member_count = member_count - 1 WHERE id = OLD.community_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1b. handle_new_user (SECURITY DEFINER — search_path especially important)
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

  INSERT INTO public.members (id, username)
  VALUES (NEW.id, _username)
  ON CONFLICT (username) DO UPDATE SET username = NEW.id::text;

  INSERT INTO public.members_private (member_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (member_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1c. update_message_like_count
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
$$ LANGUAGE plpgsql SET search_path = public;

-- 1d. update_article_like_count
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
$$ LANGUAGE plpgsql SET search_path = public;

-- 1e. update_podcast_like_count
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
$$ LANGUAGE plpgsql SET search_path = public;

-- 1f. update_message_reply_count
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
$$ LANGUAGE plpgsql SET search_path = public;

-- 1g. update_message_repost_count
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
$$ LANGUAGE plpgsql SET search_path = public;

-- 1h. check_message_rate (with bot bypass)
CREATE OR REPLACE FUNCTION public.check_message_rate()
RETURNS TRIGGER AS $$
DECLARE
  recent_count integer;
BEGIN
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
$$ LANGUAGE plpgsql SET search_path = public;

-- 1i. check_like_rate
CREATE OR REPLACE FUNCTION check_like_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
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

-- 1j. increment_article_views (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION increment_article_views(p_article_id INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE articles SET view_count = view_count + 1 WHERE id = p_article_id;
END;
$$;

-- 1k. auto_join_bot_to_community
CREATE OR REPLACE FUNCTION auto_join_bot_to_community()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.community_members (community_id, member_id)
  VALUES (NEW.id, '00000000-0000-0000-0000-000000000001')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1l. announce_new_article
CREATE OR REPLACE FUNCTION announce_new_article()
RETURNS TRIGGER AS $$
DECLARE
  community_slug TEXT;
BEGIN
  IF NEW.is_published = TRUE AND NEW.is_removed = FALSE THEN
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.is_published = FALSE) THEN
      SELECT slug INTO community_slug FROM public.communities WHERE id = NEW.community_id;

      INSERT INTO public.chat_messages (community_id, member_id, content)
      VALUES (
        NEW.community_id,
        '00000000-0000-0000-0000-000000000001',
        'Nouvel article : ' || NEW.title || ' — Lisez-le ici /communities/' || community_slug || '/articles/' || NEW.slug
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1m. announce_new_podcast
CREATE OR REPLACE FUNCTION announce_new_podcast()
RETURNS TRIGGER AS $$
DECLARE
  community_slug TEXT;
BEGIN
  IF NEW.is_published = TRUE THEN
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND OLD.is_published = FALSE) THEN
      SELECT slug INTO community_slug FROM public.communities WHERE id = NEW.community_id;

      INSERT INTO public.chat_messages (community_id, member_id, content)
      VALUES (
        NEW.community_id,
        '00000000-0000-0000-0000-000000000001',
        'Nouveau podcast : ' || NEW.title || ' — Ecoutez-le ici /communities/' || community_slug || '/podcasts/' || NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1n. update_message_dislike_count
CREATE OR REPLACE FUNCTION update_message_dislike_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.chat_messages SET dislike_count = dislike_count + 1 WHERE id = NEW.message_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.chat_messages SET dislike_count = GREATEST(dislike_count - 1, 0) WHERE id = OLD.message_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1o. update_member_message_count
CREATE OR REPLACE FUNCTION update_member_message_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.members SET message_count = message_count + 1 WHERE id = NEW.member_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.members SET message_count = GREATEST(message_count - 1, 0) WHERE id = OLD.member_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 1p. send_bot_message (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.send_bot_message(
  p_community_id INT,
  p_content TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.chat_messages (community_id, member_id, content)
  VALUES (p_community_id, '00000000-0000-0000-0000-000000000001', p_content);
END;
$$;

-- 1q. promote_community_content (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION promote_community_content()
RETURNS TRIGGER AS $$
DECLARE
  bot_id UUID := '00000000-0000-0000-0000-000000000001';
  promo_interval INT := 50;
  msg_count INT;
  content_title TEXT;
  content_type TEXT;
  templates TEXT[];
  promo_msg TEXT;
BEGIN
  IF NEW.member_id = bot_id THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO msg_count
  FROM public.chat_messages
  WHERE community_id = NEW.community_id
    AND member_id != bot_id;

  IF msg_count % promo_interval != 0 THEN
    RETURN NEW;
  END IF;

  IF random() < 0.5 THEN
    SELECT title INTO content_title
    FROM public.articles
    WHERE community_id = NEW.community_id
      AND is_published = TRUE
      AND is_removed = FALSE
    ORDER BY random()
    LIMIT 1;

    IF content_title IS NOT NULL THEN
      content_type := 'article';
      templates := ARRAY[
        '📖 T''as lu "' || content_title || '" ? C''est dans l''onglet Contenu. Check ça !',
        '💡 Petit rappel : l''article "' || content_title || '" est dispo. Bonne lecture !',
        '📰 Si t''as manqué "' || content_title || '", c''est encore là ! Va voir ça.',
        '✍️ "' || content_title || '" — un article à (re)découvrir dans le contenu.',
        '🗞️ Savais-tu qu''on a "' || content_title || '" dans nos articles ? Jette un oeil !'
      ];
    END IF;
  END IF;

  IF content_type IS NULL THEN
    SELECT title INTO content_title
    FROM public.podcasts
    WHERE community_id = NEW.community_id
      AND is_published = TRUE
      AND (is_removed = FALSE OR is_removed IS NULL)
    ORDER BY random()
    LIMIT 1;

    IF content_title IS NOT NULL THEN
      content_type := 'podcast';
      templates := ARRAY[
        '🎧 T''as écouté "' || content_title || '" ? C''est dans les podcasts. Bonne écoute !',
        '🎙️ Le podcast "' || content_title || '" est dispo. Monte le son !',
        '🔊 Petit rappel : "' || content_title || '" est dans les podcasts. À écouter !',
        '📻 Si t''as manqué "' || content_title || '", c''est encore là ! Va l''écouter.',
        '🎤 "' || content_title || '" — un podcast à (re)découvrir !'
      ];
    END IF;
  END IF;

  IF content_type IS NULL THEN
    RETURN NEW;
  END IF;

  promo_msg := templates[1 + floor(random() * array_length(templates, 1))::int];

  INSERT INTO public.chat_messages (community_id, member_id, content)
  VALUES (NEW.community_id, bot_id, promo_msg);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 1r. auto_join_taverne (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION auto_join_taverne()
RETURNS TRIGGER AS $fn$
DECLARE
  taverne_id INT;
BEGIN
  SELECT id INTO taverne_id FROM public.communities WHERE slug = 'la-taverne';
  IF taverne_id IS NOT NULL THEN
    INSERT INTO public.community_members (community_id, member_id)
    VALUES (taverne_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================
-- 2. FIX RLS POLICY ALWAYS TRUE
--    exposmetre_votes DELETE: restrict to own votes
--    Add proper DELETE policy on nordiquometre_votes
-- ============================================

-- 2a. exposmetre_votes: replace "USING (true)" with "USING (auth.uid() = member_id)"
DROP POLICY IF EXISTS "Authenticated users can delete votes" ON public.exposmetre_votes;
CREATE POLICY "Users can delete own votes"
  ON public.exposmetre_votes FOR DELETE
  USING (auth.uid() = member_id);

-- 2b. nordiquometre_votes: add proper DELETE policy (restricted to own votes)
CREATE POLICY "Users can delete own votes"
  ON public.nordiquometre_votes FOR DELETE
  USING (auth.uid() = member_id);
