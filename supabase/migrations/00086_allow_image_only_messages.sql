-- ============================================================
-- 00086: Allow image-only chat messages
--
-- chk_message_has_content (00008) required `content IS NOT NULL OR
-- repost_of_id IS NOT NULL` but image_urls was added in that same
-- migration and never included — so a message with only a pasted/
-- uploaded image (no text) violates the CHECK and fails to insert
-- ("Envoi du message impossible"). Broaden the constraint to also
-- accept a message that carries at least one image.
-- ============================================================

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chk_message_has_content;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chk_message_has_content
  CHECK (
    content IS NOT NULL
    OR repost_of_id IS NOT NULL
    OR (image_urls IS NOT NULL AND array_length(image_urls, 1) > 0)
  );
