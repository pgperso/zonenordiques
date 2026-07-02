-- Rate limiting: max 10 messages per 30 seconds per user per community
CREATE OR REPLACE FUNCTION public.check_message_rate()
RETURNS TRIGGER AS $$
DECLARE
  recent_count integer;
BEGIN
  SELECT count(*) INTO recent_count
  FROM public.chat_messages
  WHERE member_id = NEW.member_id
    AND community_id = NEW.community_id
    AND created_at > now() - interval '30 seconds';

  IF recent_count >= 10 THEN
    RAISE EXCEPTION 'Rate limit exceeded: maximum 10 messages per 30 seconds'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_message_rate ON public.chat_messages;
CREATE TRIGGER enforce_message_rate
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.check_message_rate();
