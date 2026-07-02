-- Fix: the article-publish notification trigger blocked publishing.
--
-- Migration 00055 installed trg_article_publish_notifications as a
-- BEFORE INSERT trigger. On INSERT, a BEFORE trigger runs before the
-- articles row is written to the table, so the trigger's
-- `INSERT INTO notifications (..., article_id) VALUES (..., NEW.id)`
-- referenced an article row that did not exist yet — violating the
-- notifications_article_id_fkey foreign key and aborting the whole
-- article insert. Net effect: publishing a brand-new article failed
-- with "violates foreign key constraint notifications_article_id_fkey".
--
-- Fix: run the trigger AFTER INSERT/UPDATE so the article row exists
-- when the notification is inserted. Because an AFTER trigger cannot
-- mutate NEW, the "already announced" flag is now set with an explicit
-- UPDATE. That UPDATE only writes published_notified_at — not
-- is_published — so the trigger (scoped to UPDATE OF is_published)
-- does not re-fire: no recursion.

CREATE OR REPLACE FUNCTION public.create_article_publish_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip removed, non-published, and already-announced articles.
  IF NEW.is_published <> TRUE
     OR NEW.is_removed = TRUE
     OR NEW.published_notified_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- Only fire on a fresh insert or the first false->true transition.
  IF TG_OP = 'UPDATE' AND OLD.is_published = TRUE THEN
    RETURN NULL;
  END IF;

  -- AFTER trigger: the article row now exists, so the
  -- notifications.article_id foreign key is satisfiable.
  INSERT INTO public.notifications (recipient_id, actor_id, type, article_id, comment_id)
  SELECT cm.member_id, NEW.author_id, 'article_published', NEW.id, NULL
  FROM public.community_members cm
  WHERE cm.community_id = NEW.community_id
    AND cm.member_id <> NEW.author_id
  LIMIT 500;

  -- Mark as announced. This UPDATE only touches published_notified_at,
  -- never is_published, so the "UPDATE OF is_published" trigger does
  -- not re-fire — no recursion.
  UPDATE public.articles
  SET published_notified_at = NOW()
  WHERE id = NEW.id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_article_publish_notifications ON public.articles;
CREATE TRIGGER trg_article_publish_notifications
  AFTER INSERT OR UPDATE OF is_published ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_article_publish_notifications();
