-- Notify every participant in a comment thread, not just the parent author.
--
-- Before: when Carol replied to Alice's top-level comment, only Alice was
-- notified. Bob — who had previously replied in the same thread — never
-- learned that the conversation had moved on.
--
-- After:
--   - Reply to a comment → still notifies the parent comment's author with
--     'comment_reply' (unchanged).
--   - Reply to a comment → also notifies every OTHER member who has already
--     replied in that same thread, with the new type
--     'comment_reply_thread'. The label in the UI is "X replied in a thread
--     you commented on" instead of "X replied to your comment", which would
--     be inaccurate.
--
-- The actor is always excluded; the parent author is excluded from the
-- thread-participant set so they only get one notification (the direct
-- 'comment_reply').

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('comment_reply', 'comment_reply_thread', 'comment_on_article'));

CREATE OR REPLACE FUNCTION public.create_comment_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_author UUID;
  article_author UUID;
BEGIN
  IF NEW.is_removed = TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT member_id INTO parent_author
    FROM public.article_comments
    WHERE id = NEW.parent_id;

    IF parent_author IS NOT NULL AND parent_author <> NEW.member_id THEN
      INSERT INTO public.notifications (recipient_id, actor_id, type, article_id, comment_id)
      VALUES (parent_author, NEW.member_id, 'comment_reply', NEW.article_id, NEW.id);
    END IF;

    INSERT INTO public.notifications (recipient_id, actor_id, type, article_id, comment_id)
    SELECT DISTINCT c.member_id, NEW.member_id, 'comment_reply_thread', NEW.article_id, NEW.id
    FROM public.article_comments c
    WHERE c.parent_id = NEW.parent_id
      AND c.id <> NEW.id
      AND c.is_removed = FALSE
      AND c.member_id IS NOT NULL
      AND c.member_id <> NEW.member_id
      AND (parent_author IS NULL OR c.member_id <> parent_author);
  ELSE
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
