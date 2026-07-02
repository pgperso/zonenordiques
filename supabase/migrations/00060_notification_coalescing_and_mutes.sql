-- Phase 1 of the notification enrichment: stop the bell from polluting.
--
-- Two problems with the notification system as built:
--
--  1. Every event is its own row. Five people reply to your comment ->
--     five bell entries that all say the same thing. A community of 200
--     publishing three articles a week -> three rows per member per week.
--     The bell becomes noise and gets ignored.
--
--  2. article_published fans out to EVERY member of a community with no
--     way to opt out of a tribune you only lurk in.
--
-- This migration fixes both without changing what events notify:
--
--  A. Coalescing. A new `group_key` identifies the logical target of a
--     notification (a comment thread, an article, a community's article
--     stream). A partial unique index on (recipient_id, group_key) over
--     UNREAD rows lets the triggers UPSERT: if an unread notification for
--     the same target already exists, bump its `actor_count` and
--     `updated_at` instead of inserting a new row. Once read, the next
--     event starts a fresh row again.
--
--  B. Per-tribune mute. A new `notification_mutes` table lets a member
--     silence `article_published` notifications for a specific community.
--     The publish trigger skips muted members in its fan-out.
--
-- Existing rows have a NULL group_key and never coalesce — they simply
-- age out as they are read. No data migration of behaviour required.

-- ── A. New columns on notifications ──────────────────────────────────

-- Logical grouping target. NULL for legacy rows; always set going forward.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS group_key TEXT;

-- How many events this (possibly coalesced) notification represents.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS actor_count INT NOT NULL DEFAULT 1;

-- Last time the notification was created or coalesced — the sort key, so
-- a freshly-bumped group floats back to the top of the bell.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
UPDATE public.notifications SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE public.notifications ALTER COLUMN updated_at SET DEFAULT NOW();
ALTER TABLE public.notifications ALTER COLUMN updated_at SET NOT NULL;

-- Community a notification belongs to — needed so an article_published
-- group can be labelled ("3 new articles in Canadiens") and linked to the
-- tribune. Backfilled from the article for existing rows.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS community_id INT REFERENCES public.communities(id) ON DELETE CASCADE;
UPDATE public.notifications n
  SET community_id = a.community_id
  FROM public.articles a
  WHERE n.article_id = a.id AND n.community_id IS NULL;

-- At most one UNREAD notification per (recipient, group_key): the arbiter
-- index the triggers use for ON CONFLICT. Rows with a NULL group_key
-- (legacy) never collide — NULLs are distinct in a unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_unread_group
  ON public.notifications(recipient_id, group_key)
  WHERE is_read = FALSE;

-- Sorted bell reads now order by updated_at, not created_at.
DROP INDEX IF EXISTS public.idx_notifications_recipient_unread;
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_updated
  ON public.notifications(recipient_id, is_read, updated_at DESC);

-- ── B. Per-tribune article-notification mute ─────────────────────────

CREATE TABLE IF NOT EXISTS public.notification_mutes (
  member_id    UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  community_id INT  NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (member_id, community_id)
);

ALTER TABLE public.notification_mutes ENABLE ROW LEVEL SECURITY;

-- A member fully manages their own mutes; nobody else can see or touch them.
DROP POLICY IF EXISTS "Members read own notification mutes" ON public.notification_mutes;
CREATE POLICY "Members read own notification mutes"
  ON public.notification_mutes FOR SELECT
  USING (auth.uid() = member_id);

DROP POLICY IF EXISTS "Members add own notification mutes" ON public.notification_mutes;
CREATE POLICY "Members add own notification mutes"
  ON public.notification_mutes FOR INSERT
  WITH CHECK (auth.uid() = member_id);

DROP POLICY IF EXISTS "Members remove own notification mutes" ON public.notification_mutes;
CREATE POLICY "Members remove own notification mutes"
  ON public.notification_mutes FOR DELETE
  USING (auth.uid() = member_id);

-- ── C. Comment-notification trigger, now coalescing ──────────────────

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

    -- Direct reply → notify the parent comment's author. Grouped by the
    -- comment being replied to, so repeated replies coalesce into one row.
    IF parent_author IS NOT NULL AND parent_author <> NEW.member_id THEN
      INSERT INTO public.notifications
        (recipient_id, actor_id, type, article_id, comment_id, group_key)
      VALUES
        (parent_author, NEW.member_id, 'comment_reply', NEW.article_id, NEW.id,
         'comment:' || NEW.parent_id)
      ON CONFLICT (recipient_id, group_key) WHERE is_read = FALSE
      DO UPDATE SET
        actor_id    = EXCLUDED.actor_id,
        actor_count = notifications.actor_count + 1,
        comment_id  = EXCLUDED.comment_id,
        updated_at  = NOW();
    END IF;

    -- Other thread participants → grouped by the thread root.
    INSERT INTO public.notifications
      (recipient_id, actor_id, type, article_id, comment_id, group_key)
    SELECT DISTINCT c.member_id, NEW.member_id, 'comment_reply_thread',
           NEW.article_id, NEW.id, 'thread:' || NEW.parent_id
    FROM public.article_comments c
    WHERE c.parent_id = NEW.parent_id
      AND c.id <> NEW.id
      AND c.is_removed = FALSE
      AND c.member_id IS NOT NULL
      AND c.member_id <> NEW.member_id
      AND (parent_author IS NULL OR c.member_id <> parent_author)
    ON CONFLICT (recipient_id, group_key) WHERE is_read = FALSE
    DO UPDATE SET
      actor_id    = EXCLUDED.actor_id,
      actor_count = notifications.actor_count + 1,
      comment_id  = EXCLUDED.comment_id,
      updated_at  = NOW();
  ELSE
    -- Top-level comment → notify the article's author, grouped by article.
    SELECT author_id INTO article_author
    FROM public.articles
    WHERE id = NEW.article_id;

    IF article_author IS NOT NULL AND article_author <> NEW.member_id THEN
      INSERT INTO public.notifications
        (recipient_id, actor_id, type, article_id, comment_id, group_key)
      VALUES
        (article_author, NEW.member_id, 'comment_on_article', NEW.article_id, NEW.id,
         'article:' || NEW.article_id)
      ON CONFLICT (recipient_id, group_key) WHERE is_read = FALSE
      DO UPDATE SET
        actor_id    = EXCLUDED.actor_id,
        actor_count = notifications.actor_count + 1,
        comment_id  = EXCLUDED.comment_id,
        updated_at  = NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── D. Article-publish trigger, now coalescing + mute-aware ──────────

CREATE OR REPLACE FUNCTION public.create_article_publish_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_published <> TRUE
     OR NEW.is_removed = TRUE
     OR NEW.published_notified_at IS NOT NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_published = TRUE THEN
    RETURN NULL;
  END IF;

  -- Fan out to community members, skipping the author and anyone who has
  -- muted this tribune's article notifications. Grouped per community, so
  -- a member with an unread article notification sees the count rise
  -- ("3 new articles in Canadiens") rather than three separate rows.
  INSERT INTO public.notifications
    (recipient_id, actor_id, type, article_id, community_id, group_key)
  SELECT cm.member_id, NEW.author_id, 'article_published', NEW.id,
         NEW.community_id, 'community_articles:' || NEW.community_id
  FROM public.community_members cm
  WHERE cm.community_id = NEW.community_id
    AND cm.member_id <> NEW.author_id
    AND NOT EXISTS (
      SELECT 1 FROM public.notification_mutes m
      WHERE m.member_id = cm.member_id
        AND m.community_id = NEW.community_id
    )
  LIMIT 500
  ON CONFLICT (recipient_id, group_key) WHERE is_read = FALSE
  DO UPDATE SET
    actor_id    = EXCLUDED.actor_id,
    actor_count = notifications.actor_count + 1,
    article_id  = EXCLUDED.article_id,
    updated_at  = NOW();

  UPDATE public.articles
  SET published_notified_at = NOW()
  WHERE id = NEW.id;

  RETURN NULL;
END;
$$;
