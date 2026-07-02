-- Notify community members when a new article is published.
--
-- Until now, the only article-related notification fired on comments
-- (comment_reply, comment_on_article). Readers had no way to discover
-- new articles in tribunes they had joined — they had to manually visit
-- the hub. This kills both reach for authors and stickiness for readers.
--
-- This migration adds a fourth notification type `article_published`
-- and a trigger that fires when:
--   - A new article row is inserted with is_published = TRUE, OR
--   - An existing article transitions is_published from FALSE to TRUE.
--
-- A `published_notified_at` column on articles prevents a republished
-- article from re-notifying everyone. The trigger sets it BEFORE the
-- row is saved so we cannot recurse.
--
-- The notification fan-out is capped at 500 recipients per article to
-- protect against communities with very large member counts (La Taverne
-- auto-joins every user, so a Taverne article could otherwise produce
-- tens of thousands of notification rows). 500 is enough to give every
-- engaged early member a ping without flooding the queue.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS published_notified_at TIMESTAMPTZ;

-- Extend the type CHECK to allow the new notification kind.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('comment_reply', 'comment_reply_thread', 'comment_on_article', 'article_published'));

CREATE OR REPLACE FUNCTION public.create_article_publish_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip removed articles and ones that have already been announced.
  IF NEW.is_published <> TRUE
     OR NEW.is_removed = TRUE
     OR NEW.published_notified_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Only fire on a fresh insert, or on the first false→true transition.
  IF TG_OP = 'UPDATE' AND OLD.is_published = TRUE THEN
    RETURN NEW;
  END IF;

  -- Fan out to community members, excluding the author themselves and
  -- capped at 500 to keep the trigger bounded.
  INSERT INTO public.notifications (recipient_id, actor_id, type, article_id, comment_id)
  SELECT cm.member_id, NEW.author_id, 'article_published', NEW.id, NULL
  FROM public.community_members cm
  WHERE cm.community_id = NEW.community_id
    AND cm.member_id <> NEW.author_id
  LIMIT 500;

  -- Mark as notified so a re-publish (false → true a second time) is a no-op.
  -- BEFORE trigger + NEW assignment means no recursive trigger firing.
  NEW.published_notified_at := NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_article_publish_notifications ON public.articles;
CREATE TRIGGER trg_article_publish_notifications
  BEFORE INSERT OR UPDATE OF is_published ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_article_publish_notifications();
