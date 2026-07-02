-- Threaded replies + moderation on article comments.
--
-- Features added:
--   1. parent_id (self-FK) so a comment can be a reply to another comment
--   2. reply_count kept in sync via trigger, for efficient rendering + badges
--   3. Soft-delete tracking (removed_at, removed_by)
--   4. RLS policy allowing community admins / moderators to soft-delete any
--      comment on articles of THEIR community (not global)
--   5. Realtime publication so clients see replies appear live
--
-- Idempotent: uses IF NOT EXISTS / CREATE OR REPLACE where possible.

ALTER TABLE public.article_comments
  ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES public.article_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS reply_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by UUID REFERENCES public.members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_article_comments_parent
  ON public.article_comments(parent_id, created_at ASC)
  WHERE is_removed = FALSE;

-- Prevent replies to replies beyond depth 2 (keeps UI indentation sane).
-- Replies can target a root comment, but a reply can't be the parent of
-- another reply.
CREATE OR REPLACE FUNCTION public.enforce_comment_depth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_parent BIGINT;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT parent_id INTO parent_parent
    FROM public.article_comments
    WHERE id = NEW.parent_id;
    IF parent_parent IS NOT NULL THEN
      RAISE EXCEPTION 'Nested replies beyond depth 2 are not allowed'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_comment_depth ON public.article_comments;
CREATE TRIGGER trg_enforce_comment_depth
  BEFORE INSERT ON public.article_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_comment_depth();

-- Keep reply_count in sync on the parent when replies are created, deleted
-- or soft-removed.
CREATE OR REPLACE FUNCTION public.update_article_comment_reply_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS NOT NULL AND NEW.is_removed = FALSE THEN
      UPDATE public.article_comments
      SET reply_count = reply_count + 1
      WHERE id = NEW.parent_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Soft-delete toggle on a reply
    IF NEW.parent_id IS NOT NULL AND OLD.is_removed = FALSE AND NEW.is_removed = TRUE THEN
      UPDATE public.article_comments
      SET reply_count = GREATEST(reply_count - 1, 0)
      WHERE id = NEW.parent_id;
    ELSIF NEW.parent_id IS NOT NULL AND OLD.is_removed = TRUE AND NEW.is_removed = FALSE THEN
      UPDATE public.article_comments
      SET reply_count = reply_count + 1
      WHERE id = NEW.parent_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.parent_id IS NOT NULL AND OLD.is_removed = FALSE THEN
      UPDATE public.article_comments
      SET reply_count = GREATEST(reply_count - 1, 0)
      WHERE id = OLD.parent_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_article_comment_reply_count ON public.article_comments;
CREATE TRIGGER trg_article_comment_reply_count
  AFTER INSERT OR UPDATE OR DELETE ON public.article_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_article_comment_reply_count();

-- Moderation policy: owners / admins / moderators of the article's community
-- may soft-delete (UPDATE is_removed) any comment on articles in that
-- community. They cannot edit content — only flag as removed.
DROP POLICY IF EXISTS "Moderators can moderate comments in their community" ON public.article_comments;
CREATE POLICY "Moderators can moderate comments in their community"
  ON public.article_comments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.articles a
      JOIN public.community_member_roles cmr ON cmr.community_id = a.community_id
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE a.id = article_comments.article_id
        AND cmr.member_id = auth.uid()
        AND r.code IN ('owner', 'admin', 'moderator')
    )
  );

-- Enable Realtime so readers see new replies without polling.
ALTER PUBLICATION supabase_realtime ADD TABLE public.article_comments;
