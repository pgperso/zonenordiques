-- Allow bot messages to be sent from the client by calling a
-- SECURITY DEFINER function. This bypasses the RLS policy that
-- requires auth.uid() = member_id, since the bot's member_id
-- differs from the calling user's auth.uid().

CREATE OR REPLACE FUNCTION public.send_bot_message(
  p_community_id INT,
  p_content TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only authenticated users can trigger bot messages
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.chat_messages (community_id, member_id, content)
  VALUES (p_community_id, '00000000-0000-0000-0000-000000000001', p_content);
END;
$$;
