-- ============================================================
-- 00093: reply_count reflects soft-deletes
--
-- Messages are soft-deleted (is_removed = true via UPDATE), but the reply
-- counter trigger (00012) only fired on INSERT/DELETE — so removing a reply
-- never decremented its parent's reply_count and the flame kept the old
-- number. Recreate the trigger to also handle soft-remove / restore, and
-- backfill reply_count to the number of NON-removed direct replies.
-- ============================================================

CREATE OR REPLACE FUNCTION update_message_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_id IS NOT NULL AND COALESCE(NEW.is_removed, false) = false THEN
      UPDATE public.chat_messages SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.parent_id IS NOT NULL AND COALESCE(OLD.is_removed, false) = false THEN
      UPDATE public.chat_messages SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = OLD.parent_id;
    END IF;

  ELSIF TG_OP = 'UPDATE' AND NEW.parent_id IS NOT NULL THEN
    -- Reply soft-removed → decrement; restored → increment.
    IF COALESCE(OLD.is_removed, false) = false AND COALESCE(NEW.is_removed, false) = true THEN
      UPDATE public.chat_messages SET reply_count = GREATEST(reply_count - 1, 0) WHERE id = NEW.parent_id;
    ELSIF COALESCE(OLD.is_removed, false) = true AND COALESCE(NEW.is_removed, false) = false THEN
      UPDATE public.chat_messages SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_message_reply_count ON public.chat_messages;
CREATE TRIGGER trg_message_reply_count
AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION update_message_reply_count();

-- Backfill to the correct current value (non-removed direct replies).
UPDATE public.chat_messages p
SET reply_count = sub.cnt
FROM (
  SELECT parent_id, count(*) AS cnt
  FROM public.chat_messages
  WHERE parent_id IS NOT NULL AND is_removed = false
  GROUP BY parent_id
) sub
WHERE p.id = sub.parent_id AND p.reply_count IS DISTINCT FROM sub.cnt;

-- Parents whose replies are now all removed → reset to 0.
UPDATE public.chat_messages p
SET reply_count = 0
WHERE p.reply_count <> 0
  AND NOT EXISTS (
    SELECT 1 FROM public.chat_messages c
    WHERE c.parent_id = p.id AND c.is_removed = false
  );
