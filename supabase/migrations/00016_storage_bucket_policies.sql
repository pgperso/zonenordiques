-- Storage bucket policies for chat-images
-- Ensure the bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can read public images
CREATE POLICY "Public read access for chat images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-images');

-- Only authenticated users can upload
CREATE POLICY "Authenticated users can upload chat images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-images'
    AND auth.uid() IS NOT NULL
  );

-- Users can only delete their own uploads (path: communityId/memberId/...)
CREATE POLICY "Users can delete own chat images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chat-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Article covers bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('article-covers', 'article-covers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for article covers"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'article-covers');

CREATE POLICY "Authenticated users can upload article covers"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'article-covers'
    AND auth.uid() IS NOT NULL
  );
