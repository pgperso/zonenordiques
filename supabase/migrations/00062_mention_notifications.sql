-- Phase 3 of the notification enrichment: @mentions.
--
-- Typing "@username" in a chat message or an article comment now
-- notifies that member directly. Mentions are the highest-signal
-- notification on the platform — someone deliberately addressed you —
-- and the lowest-noise: the writer chose to send it.
--
-- Parsing happens here, in AFTER INSERT triggers, with a regex over the
-- message/comment text. The app's autocomplete inserts exact usernames,
-- but the trigger is the source of truth: paste a message with a real
-- "@name" in it and the mention still resolves.
--
-- Coalescing follows the house rule — chat mentions group per community,
-- comment mentions per article — so a burst of mentions is one bell
-- entry ("Alice and 3 others mentioned you"). Mentioning yourself, or a
-- name that matches no member, does nothing.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'comment_reply',
    'comment_reply_thread',
    'comment_on_article',
    'article_published',
    'chat_reply',
    'mention'
  ));

-- ── Chat message mentions ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_chat_mention_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.content IS NULL OR NEW.is_removed = TRUE THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications
    (recipient_id, actor_id, type, community_id, group_key)
  SELECT DISTINCT mem.id, NEW.member_id, 'mention', NEW.community_id,
         'mention_chat:' || NEW.community_id
  FROM regexp_matches(NEW.content, '@([A-Za-z0-9_]{2,50})', 'g') AS tok
  JOIN public.members mem ON lower(mem.username) = lower(tok[1])
  WHERE mem.id <> NEW.member_id
  ON CONFLICT (recipient_id, group_key) WHERE is_read = FALSE
  DO UPDATE SET
    actor_id    = EXCLUDED.actor_id,
    actor_count = notifications.actor_count + 1,
    updated_at  = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_chat_mention_notifications ON public.chat_messages;
CREATE TRIGGER trg_create_chat_mention_notifications
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.create_chat_mention_notifications();

-- ── Article comment mentions ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_comment_mention_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_removed = TRUE THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications
    (recipient_id, actor_id, type, article_id, comment_id, group_key)
  SELECT DISTINCT mem.id, NEW.member_id, 'mention', NEW.article_id, NEW.id,
         'mention_comment:' || NEW.article_id
  FROM regexp_matches(NEW.content, '@([A-Za-z0-9_]{2,50})', 'g') AS tok
  JOIN public.members mem ON lower(mem.username) = lower(tok[1])
  WHERE mem.id <> NEW.member_id
  ON CONFLICT (recipient_id, group_key) WHERE is_read = FALSE
  DO UPDATE SET
    actor_id    = EXCLUDED.actor_id,
    actor_count = notifications.actor_count + 1,
    comment_id  = EXCLUDED.comment_id,
    updated_at  = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_comment_mention_notifications ON public.article_comments;
CREATE TRIGGER trg_create_comment_mention_notifications
  AFTER INSERT ON public.article_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_comment_mention_notifications();
