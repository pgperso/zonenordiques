-- Triggers to maintain reply_count and repost_count on chat_messages

-- Reply counter trigger
CREATE OR REPLACE FUNCTION update_message_reply_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    UPDATE public.chat_messages SET reply_count = reply_count + 1 WHERE id = NEW.parent_id;
  ELSIF TG_OP = 'DELETE' AND OLD.parent_id IS NOT NULL THEN
    UPDATE public.chat_messages SET reply_count = reply_count - 1 WHERE id = OLD.parent_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_message_reply_count
AFTER INSERT OR DELETE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION update_message_reply_count();

-- Repost/quote counter trigger
CREATE OR REPLACE FUNCTION update_message_repost_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.repost_of_id IS NOT NULL THEN
      UPDATE public.chat_messages SET repost_count = repost_count + 1 WHERE id = NEW.repost_of_id;
    END IF;
    IF NEW.quote_of_id IS NOT NULL THEN
      UPDATE public.chat_messages SET repost_count = repost_count + 1 WHERE id = NEW.quote_of_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.repost_of_id IS NOT NULL THEN
      UPDATE public.chat_messages SET repost_count = repost_count - 1 WHERE id = OLD.repost_of_id;
    END IF;
    IF OLD.quote_of_id IS NOT NULL THEN
      UPDATE public.chat_messages SET repost_count = repost_count - 1 WHERE id = OLD.quote_of_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_message_repost_count
AFTER INSERT OR DELETE ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION update_message_repost_count();
