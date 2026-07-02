-- Message dislikes system (mirrors message_likes)

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS dislike_count INT DEFAULT 0 NOT NULL;

CREATE TABLE public.message_dislikes (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, member_id)
);

CREATE INDEX idx_message_dislikes_message ON public.message_dislikes(message_id);
CREATE INDEX idx_message_dislikes_member ON public.message_dislikes(member_id);

-- Trigger to keep dislike_count in sync
CREATE OR REPLACE FUNCTION update_message_dislike_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.chat_messages SET dislike_count = dislike_count + 1 WHERE id = NEW.message_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.chat_messages SET dislike_count = GREATEST(dislike_count - 1, 0) WHERE id = OLD.message_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_message_dislike_count
AFTER INSERT OR DELETE ON public.message_dislikes
FOR EACH ROW EXECUTE FUNCTION update_message_dislike_count();

-- RLS
ALTER TABLE public.message_dislikes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Message dislikes are publicly readable"
  ON public.message_dislikes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can dislike messages"
  ON public.message_dislikes FOR INSERT
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Members can remove their own dislikes"
  ON public.message_dislikes FOR DELETE
  USING (auth.uid() = member_id);
