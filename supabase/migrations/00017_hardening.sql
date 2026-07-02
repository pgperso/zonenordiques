-- ============================================================
-- 00017: Security hardening (RLS, RPC, rate limiting, checks)
-- ============================================================

-- 1. INSERT/DELETE policies for member_restrictions (moderators only)
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

-- 2. Write policies for community_member_roles (admins only)
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

-- 3. Article view count RPC (atomic increment, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION increment_article_views(p_article_id INT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE articles SET view_count = view_count + 1 WHERE id = p_article_id;
$$;

-- 4. Rate limiting on likes (max 30 likes per 30 seconds per user)
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

CREATE TRIGGER check_message_like_rate
  BEFORE INSERT ON public.message_likes
  FOR EACH ROW EXECUTE FUNCTION check_like_rate();

CREATE TRIGGER check_article_like_rate
  BEFORE INSERT ON public.article_likes
  FOR EACH ROW EXECUTE FUNCTION check_like_rate();

CREATE TRIGGER check_podcast_like_rate
  BEFORE INSERT ON public.podcast_likes
  FOR EACH ROW EXECUTE FUNCTION check_like_rate();

-- 5. CHECK constraints for data integrity
ALTER TABLE public.member_restrictions
  ADD CONSTRAINT valid_restriction_type
  CHECK (restriction_type IN ('chat:mute', 'community:ban'));

ALTER TABLE public.chat_messages
  ADD CONSTRAINT valid_message_length
  CHECK (content IS NULL OR char_length(content) <= 1000);
