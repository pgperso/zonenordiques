-- Enrich chat_messages for social feed features: replies, reposts, quotes, images, likes

-- New columns for social features
ALTER TABLE public.chat_messages
  ADD COLUMN parent_id BIGINT REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN repost_of_id BIGINT REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN quote_of_id BIGINT REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN image_urls TEXT[] DEFAULT '{}',
  ADD COLUMN like_count INT DEFAULT 0,
  ADD COLUMN reply_count INT DEFAULT 0,
  ADD COLUMN repost_count INT DEFAULT 0;

-- Allow content to be nullable for pure reposts (repost without comment)
ALTER TABLE public.chat_messages ALTER COLUMN content DROP NOT NULL;

-- A message must have content OR be a repost
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chk_message_has_content
  CHECK (content IS NOT NULL OR repost_of_id IS NOT NULL);

-- Indexes for the new columns (partial indexes for efficiency)
CREATE INDEX idx_chat_messages_parent ON public.chat_messages(parent_id)
  WHERE parent_id IS NOT NULL;
CREATE INDEX idx_chat_messages_repost ON public.chat_messages(repost_of_id)
  WHERE repost_of_id IS NOT NULL;
CREATE INDEX idx_chat_messages_quote ON public.chat_messages(quote_of_id)
  WHERE quote_of_id IS NOT NULL;
