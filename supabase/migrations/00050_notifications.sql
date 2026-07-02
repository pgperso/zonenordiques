-- Lightweight notifications system, scoped for now to article comments.
-- Two notification types:
--   'comment_reply'      → someone replied to YOUR comment
--   'comment_on_article' → someone commented on an article YOU wrote
--
-- The table is deliberately small and denormalised: we store the resolved
-- article_id, comment_id and actor_id so reads don't need joins to render
-- the "X replied to your comment on article Y" string + deep link.
--
-- A trigger on article_comments INSERT generates notifications automatically.
-- Self-actions (replying to your own comment, commenting on your own article)
-- never create a notification.

CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  recipient_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('comment_reply', 'comment_on_article')),
  article_id INT REFERENCES public.articles(id) ON DELETE CASCADE,
  comment_id BIGINT REFERENCES public.article_comments(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast "my unread notifications, newest first" queries
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications(recipient_id, is_read, created_at DESC);

-- RLS: a user can only ever read or update their own notifications.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = recipient_id);

-- No direct INSERT from clients — only triggers create notifications.

-- Trigger: when a new article_comment is inserted, generate the relevant
-- notification rows.
CREATE OR REPLACE FUNCTION public.create_comment_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_member UUID;
  article_author UUID;
BEGIN
  IF NEW.is_removed = TRUE THEN
    RETURN NEW;
  END IF;

  -- Reply → notify parent comment's author (unless replying to self)
  IF NEW.parent_id IS NOT NULL THEN
    SELECT member_id INTO parent_member
    FROM public.article_comments
    WHERE id = NEW.parent_id;

    IF parent_member IS NOT NULL AND parent_member <> NEW.member_id THEN
      INSERT INTO public.notifications (recipient_id, actor_id, type, article_id, comment_id)
      VALUES (parent_member, NEW.member_id, 'comment_reply', NEW.article_id, NEW.id);
    END IF;
  ELSE
    -- Top-level comment → notify the article's author (unless commenting on own)
    SELECT author_id INTO article_author
    FROM public.articles
    WHERE id = NEW.article_id;

    IF article_author IS NOT NULL AND article_author <> NEW.member_id THEN
      INSERT INTO public.notifications (recipient_id, actor_id, type, article_id, comment_id)
      VALUES (article_author, NEW.member_id, 'comment_on_article', NEW.article_id, NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_comment_notifications ON public.article_comments;
CREATE TRIGGER trg_create_comment_notifications
  AFTER INSERT ON public.article_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_comment_notifications();

-- Enable Realtime so the bell icon updates without polling.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
