-- Message likes system with denormalized counter

CREATE TABLE public.message_likes (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, member_id)
);

CREATE INDEX idx_message_likes_message ON public.message_likes(message_id);
CREATE INDEX idx_message_likes_member ON public.message_likes(member_id);

-- Trigger to keep like_count in sync on chat_messages
CREATE OR REPLACE FUNCTION update_message_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.chat_messages SET like_count = like_count + 1 WHERE id = NEW.message_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.chat_messages SET like_count = like_count - 1 WHERE id = OLD.message_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_message_like_count
AFTER INSERT OR DELETE ON public.message_likes
FOR EACH ROW EXECUTE FUNCTION update_message_like_count();

-- Enable RLS
ALTER TABLE public.message_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Message likes are publicly readable"
  ON public.message_likes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can like messages"
  ON public.message_likes FOR INSERT
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Members can unlike their own likes"
  ON public.message_likes FOR DELETE
  USING (auth.uid() = member_id);
