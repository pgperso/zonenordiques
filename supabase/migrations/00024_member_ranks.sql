-- Member message count + rank system

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS message_count INT DEFAULT 0 NOT NULL;

-- Backfill existing message counts
UPDATE public.members m
SET message_count = (
  SELECT count(*) FROM public.chat_messages cm
  WHERE cm.member_id = m.id AND cm.is_removed = false
);

-- Trigger to keep message_count in sync
CREATE OR REPLACE FUNCTION update_member_message_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.members SET message_count = message_count + 1 WHERE id = NEW.member_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.members SET message_count = GREATEST(message_count - 1, 0) WHERE id = OLD.member_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_member_message_count
AFTER INSERT OR DELETE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION update_member_message_count();
