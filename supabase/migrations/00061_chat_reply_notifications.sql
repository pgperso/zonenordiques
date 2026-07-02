-- Phase 2 of the notification enrichment: chat reply notifications.
--
-- Until now, replying to a chat message set chat_messages.parent_id and
-- bumped the parent's reply_count — but the parent message's author was
-- never told. If you posted in a tribune and someone answered you, you
-- only found out by chance.
--
-- This adds a 'chat_reply' notification: when a reply is inserted into
-- chat_messages, the author of the parent message is notified. As with
-- every other type, the notification coalesces (group_key keyed on the
-- parent message) so ten answers to one message are one bell entry, and
-- a reply to your own message never notifies you.
--
-- Presence suppression — not wanting to ping you about a reply you are
-- already watching scroll by — is handled client-side: the bell silently
-- marks chat_reply notifications read while you have that tribune open.
-- That logic lives in the app, not here, because presence is ephemeral
-- and never touches the database.

-- Allow the new type.
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'comment_reply',
    'comment_reply_thread',
    'comment_on_article',
    'article_published',
    'chat_reply'
  ));

-- Trigger: a reply in the feed notifies the parent message's author.
CREATE OR REPLACE FUNCTION public.create_chat_reply_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parent_author UUID;
BEGIN
  -- Only replies; a removed message never notifies.
  IF NEW.parent_id IS NULL OR NEW.is_removed = TRUE THEN
    RETURN NEW;
  END IF;

  SELECT member_id INTO parent_author
  FROM public.chat_messages
  WHERE id = NEW.parent_id;

  -- No author (deleted account) or replying to self → nothing to do.
  IF parent_author IS NULL OR parent_author = NEW.member_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications
    (recipient_id, actor_id, type, community_id, group_key)
  VALUES
    (parent_author, NEW.member_id, 'chat_reply', NEW.community_id,
     'chat_message:' || NEW.parent_id)
  ON CONFLICT (recipient_id, group_key) WHERE is_read = FALSE
  DO UPDATE SET
    actor_id    = EXCLUDED.actor_id,
    actor_count = notifications.actor_count + 1,
    updated_at  = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_chat_reply_notification ON public.chat_messages;
CREATE TRIGGER trg_create_chat_reply_notification
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.create_chat_reply_notification();
