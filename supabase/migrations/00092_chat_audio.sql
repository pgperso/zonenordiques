-- ============================================================
-- 00092: Allow audio attachments in chat messages
--
-- Adds an audio_url (+ duration) to chat_messages, broadens the content
-- CHECK so an audio-only message is valid, and creates a public chat-audio
-- storage bucket mirroring chat-images (public read, authed upload, own-file
-- delete). Path convention: {communityId}/{memberId}/{timestamp}.{ext}.
-- ============================================================

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_duration_seconds INT;

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chk_message_has_content;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chk_message_has_content
  CHECK (
    content IS NOT NULL
    OR repost_of_id IS NOT NULL
    OR (image_urls IS NOT NULL AND array_length(image_urls, 1) > 0)
    OR audio_url IS NOT NULL
  );

-- Storage bucket (25 MB, common audio mime types).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-audio', 'chat-audio', true, 26214400,
  ARRAY['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/webm']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for chat audio"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-audio');

CREATE POLICY "Authenticated users can upload chat audio"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-audio'
    AND auth.uid() IS NOT NULL
  );

-- Own uploads only (path: communityId/memberId/...).
CREATE POLICY "Users can delete own chat audio"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chat-audio'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
