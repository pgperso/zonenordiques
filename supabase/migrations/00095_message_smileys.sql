-- Message "smiley" reaction (mirrors message_likes / message_dislikes).
-- Third mutually-exclusive reaction: a member holds at most one of
-- like / dislike / smiley per message (enforced client-side, same as the
-- existing like<->dislike toggle).

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS smiley_count INT DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS public.message_smileys (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_message_smileys_message ON public.message_smileys(message_id);
CREATE INDEX IF NOT EXISTS idx_message_smileys_member ON public.message_smileys(member_id);

-- Trigger to keep smiley_count in sync (search_path pinned per 00037).
CREATE OR REPLACE FUNCTION update_message_smiley_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.chat_messages SET smiley_count = smiley_count + 1 WHERE id = NEW.message_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.chat_messages SET smiley_count = GREATEST(smiley_count - 1, 0) WHERE id = OLD.message_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_message_smiley_count ON public.message_smileys;
CREATE TRIGGER trg_message_smiley_count
AFTER INSERT OR DELETE ON public.message_smileys
FOR EACH ROW EXECUTE FUNCTION update_message_smiley_count();

-- RLS
ALTER TABLE public.message_smileys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Message smileys are publicly readable"
  ON public.message_smileys FOR SELECT USING (true);

CREATE POLICY "Authenticated users can smiley messages"
  ON public.message_smileys FOR INSERT
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Members can remove their own smileys"
  ON public.message_smileys FOR DELETE
  USING (auth.uid() = member_id);
