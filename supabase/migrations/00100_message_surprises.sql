-- Message "surprise" reaction (mirrors message_smileys / message_dislikes).
-- Fourth mutually-exclusive reaction: a member holds at most one of
-- like / smiley / dislike / surprise per message (enforced client-side).

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS surprise_count INT DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS public.message_surprises (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_message_surprises_message ON public.message_surprises(message_id);
CREATE INDEX IF NOT EXISTS idx_message_surprises_member ON public.message_surprises(member_id);

-- Trigger to keep surprise_count in sync (search_path pinned per 00037).
CREATE OR REPLACE FUNCTION update_message_surprise_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.chat_messages SET surprise_count = surprise_count + 1 WHERE id = NEW.message_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.chat_messages SET surprise_count = GREATEST(surprise_count - 1, 0) WHERE id = OLD.message_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_message_surprise_count ON public.message_surprises;
CREATE TRIGGER trg_message_surprise_count
AFTER INSERT OR DELETE ON public.message_surprises
FOR EACH ROW EXECUTE FUNCTION update_message_surprise_count();

-- RLS
ALTER TABLE public.message_surprises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Message surprises are publicly readable"
  ON public.message_surprises FOR SELECT USING (true);

CREATE POLICY "Authenticated users can surprise messages"
  ON public.message_surprises FOR INSERT
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Members can remove their own surprises"
  ON public.message_surprises FOR DELETE
  USING (auth.uid() = member_id);
