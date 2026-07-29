-- ============================================================
-- 00094: show who replied last ("QcFan a répondu…")
--
-- Denormalize the latest (non-removed) reply's author onto the parent so the
-- feed can show it without an N+1 lookup. Maintained by a full recompute of
-- reply stats (count + last replier) whenever a reply is added, removed,
-- restored, reparented or hard-deleted. Recompute (vs. incremental) keeps the
-- "last replier" always correct, including after a soft-delete of the newest
-- reply.
-- ============================================================

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS last_reply_username TEXT;

CREATE OR REPLACE FUNCTION recompute_reply_stats(p_parent BIGINT)
RETURNS void AS $$
BEGIN
  IF p_parent IS NULL THEN RETURN; END IF;
  UPDATE public.chat_messages p SET
    reply_count = COALESCE((
      SELECT count(*) FROM public.chat_messages c
      WHERE c.parent_id = p_parent AND c.is_removed = false
    ), 0),
    last_reply_username = (
      SELECT m.username FROM public.chat_messages c
      JOIN public.members m ON m.id = c.member_id
      WHERE c.parent_id = p_parent AND c.is_removed = false
      ORDER BY c.created_at DESC
      LIMIT 1
    )
  WHERE p.id = p_parent;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION update_message_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM recompute_reply_stats(NEW.parent_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM recompute_reply_stats(OLD.parent_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
      PERFORM recompute_reply_stats(OLD.parent_id);
      PERFORM recompute_reply_stats(NEW.parent_id);
    ELSIF OLD.is_removed IS DISTINCT FROM NEW.is_removed THEN
      PERFORM recompute_reply_stats(NEW.parent_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_message_reply_count ON public.chat_messages;
CREATE TRIGGER trg_message_reply_count
AFTER INSERT OR UPDATE OR DELETE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION update_message_reply_count();

-- Backfill every parent that has (or had) replies.
UPDATE public.chat_messages p SET
  reply_count = COALESCE((
    SELECT count(*) FROM public.chat_messages c
    WHERE c.parent_id = p.id AND c.is_removed = false
  ), 0),
  last_reply_username = (
    SELECT m.username FROM public.chat_messages c
    JOIN public.members m ON m.id = c.member_id
    WHERE c.parent_id = p.id AND c.is_removed = false
    ORDER BY c.created_at DESC
    LIMIT 1
  )
WHERE EXISTS (SELECT 1 FROM public.chat_messages c WHERE c.parent_id = p.id);
