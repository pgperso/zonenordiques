-- Make every notification carry its community, so the bell can be scoped
-- to the brand the visitor is actually on.
--
-- The database is shared across brands (Zone Nordiques / Zone Expos / CFL
-- Québec), and members are shared with it. Every other surface — feed,
-- tribunes, search, sitemap, RSS, newsletter, press gallery — filters by
-- `getBrandCommunityIds()`. The notification bell never did, so a hockey
-- member saw baseball notifications and "mark all read" on one site wiped
-- the other site's unread bell.
--
-- The obvious fix (filter the read query on `community_id`) could not work
-- as-is: `community_id` was added in 00060 and is only populated by the
-- chat and article-publish triggers. The four comment-derived types left
-- it NULL on every new row, so filtering would have silently hidden them.
-- This migration closes that gap first, then the app filters.
--
-- Idempotent: safe to re-run.

-- ── 1. Backfill the rows that are missing it ─────────────────────────
-- Every comment-derived notification references an article, and an article
-- always belongs to exactly one community. (00060 ran this same backfill
-- once; the triggers it rewrote then stopped maintaining the column, so
-- everything created since is NULL again.)
UPDATE public.notifications n
  SET community_id = a.community_id
  FROM public.articles a
  WHERE n.article_id = a.id
    AND n.community_id IS NULL;

-- ── 2. Comment notifications now record the community ────────────────
-- Same body as 00060 section C, with `community_id` added to the three
-- INSERTs (and to the DO UPDATE, so a legacy unread row is repaired the
-- next time it coalesces).
CREATE OR REPLACE FUNCTION public.create_comment_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_author     UUID;
  article_author    UUID;
  article_community INT;
BEGIN
  IF NEW.is_removed = TRUE THEN
    RETURN NEW;
  END IF;

  -- The article's tribune is the notification's brand scope.
  SELECT community_id INTO article_community
  FROM public.articles
  WHERE id = NEW.article_id;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT member_id INTO parent_author
    FROM public.article_comments
    WHERE id = NEW.parent_id;

    -- Direct reply → notify the parent comment's author. Grouped by the
    -- comment being replied to, so repeated replies coalesce into one row.
    IF parent_author IS NOT NULL AND parent_author <> NEW.member_id THEN
      INSERT INTO public.notifications
        (recipient_id, actor_id, type, article_id, comment_id, community_id, group_key)
      VALUES
        (parent_author, NEW.member_id, 'comment_reply', NEW.article_id, NEW.id,
         article_community, 'comment:' || NEW.parent_id)
      ON CONFLICT (recipient_id, group_key) WHERE is_read = FALSE
      DO UPDATE SET
        actor_id     = EXCLUDED.actor_id,
        actor_count  = notifications.actor_count + 1,
        comment_id   = EXCLUDED.comment_id,
        community_id = EXCLUDED.community_id,
        updated_at   = NOW();
    END IF;

    -- Other thread participants → grouped by the thread root.
    INSERT INTO public.notifications
      (recipient_id, actor_id, type, article_id, comment_id, community_id, group_key)
    SELECT DISTINCT c.member_id, NEW.member_id, 'comment_reply_thread',
           NEW.article_id, NEW.id, article_community, 'thread:' || NEW.parent_id
    FROM public.article_comments c
    WHERE c.parent_id = NEW.parent_id
      AND c.id <> NEW.id
      AND c.is_removed = FALSE
      AND c.member_id IS NOT NULL
      AND c.member_id <> NEW.member_id
      AND (parent_author IS NULL OR c.member_id <> parent_author)
    ON CONFLICT (recipient_id, group_key) WHERE is_read = FALSE
    DO UPDATE SET
      actor_id     = EXCLUDED.actor_id,
      actor_count  = notifications.actor_count + 1,
      comment_id   = EXCLUDED.comment_id,
      community_id = EXCLUDED.community_id,
      updated_at   = NOW();
  ELSE
    -- Top-level comment → notify the article's author, grouped by article.
    SELECT author_id INTO article_author
    FROM public.articles
    WHERE id = NEW.article_id;

    IF article_author IS NOT NULL AND article_author <> NEW.member_id THEN
      INSERT INTO public.notifications
        (recipient_id, actor_id, type, article_id, comment_id, community_id, group_key)
      VALUES
        (article_author, NEW.member_id, 'comment_on_article', NEW.article_id, NEW.id,
         article_community, 'article:' || NEW.article_id)
      ON CONFLICT (recipient_id, group_key) WHERE is_read = FALSE
      DO UPDATE SET
        actor_id     = EXCLUDED.actor_id,
        actor_count  = notifications.actor_count + 1,
        comment_id   = EXCLUDED.comment_id,
        community_id = EXCLUDED.community_id,
        updated_at   = NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. Comment @mentions now record the community ────────────────────
-- Same body as 00062, with `community_id` sourced from the article. (The
-- chat-mention twin already sets it from NEW.community_id.)
CREATE OR REPLACE FUNCTION public.create_comment_mention_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  article_community INT;
BEGIN
  IF NEW.is_removed = TRUE THEN
    RETURN NEW;
  END IF;

  SELECT community_id INTO article_community
  FROM public.articles
  WHERE id = NEW.article_id;

  INSERT INTO public.notifications
    (recipient_id, actor_id, type, article_id, comment_id, community_id, group_key)
  SELECT DISTINCT mem.id, NEW.member_id, 'mention', NEW.article_id, NEW.id,
         article_community, 'mention_comment:' || NEW.article_id
  FROM regexp_matches(NEW.content, '@([A-Za-z0-9_]{2,50})', 'g') AS tok
  JOIN public.members mem ON lower(mem.username) = lower(tok[1])
  WHERE mem.id <> NEW.member_id
  ON CONFLICT (recipient_id, group_key) WHERE is_read = FALSE
  DO UPDATE SET
    actor_id     = EXCLUDED.actor_id,
    actor_count  = notifications.actor_count + 1,
    comment_id   = EXCLUDED.comment_id,
    community_id = EXCLUDED.community_id,
    updated_at   = NOW();

  RETURN NEW;
END;
$$;

-- ── 4. Index matching the new read shape ─────────────────────────────
-- The bell now reads (recipient_id, is_read, community_id IN (…)) ordered
-- by updated_at; mirrors idx_notifications_recipient_updated from 00060.
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread_community
  ON public.notifications(recipient_id, is_read, community_id, updated_at DESC);

-- ── Verification ─────────────────────────────────────────────────────
-- A) Must return 0 — any row left without a community would be invisible
--    in the bell once the app starts filtering.
--      SELECT COUNT(*) AS orphans FROM public.notifications WHERE community_id IS NULL;
--
-- B) Every type should now be represented with a non-NULL community.
--      SELECT type, COUNT(*) FILTER (WHERE community_id IS NULL) AS missing, COUNT(*) AS total
--      FROM public.notifications GROUP BY type ORDER BY type;
