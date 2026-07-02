-- Podcast admin: add removal columns + RLS policies + storage bucket

-- Add removal columns to podcasts
ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS is_removed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by UUID REFERENCES public.members(id);

-- RLS for podcasts
ALTER TABLE public.podcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published podcasts are publicly readable"
  ON public.podcasts FOR SELECT
  USING (is_published = true AND (is_removed = false OR is_removed IS NULL));

CREATE POLICY "Authors can see their own podcasts"
  ON public.podcasts FOR SELECT
  USING (auth.uid() = published_by);

CREATE POLICY "Authenticated users can create podcasts"
  ON public.podcasts FOR INSERT
  WITH CHECK (auth.uid() = published_by);

CREATE POLICY "Authors can update their own podcasts"
  ON public.podcasts FOR UPDATE
  USING (auth.uid() = published_by);

-- Storage bucket for podcast audio
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'podcast-audio',
  'podcast-audio',
  true,
  104857600, -- 100 MB
  ARRAY['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for podcast-audio bucket
CREATE POLICY "Public podcast audio read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'podcast-audio');

CREATE POLICY "Authenticated users can upload podcast audio"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'podcast-audio' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own podcast audio"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'podcast-audio' AND auth.uid()::text = (storage.foldername(name))[2]);

CREATE POLICY "Users can delete their own podcast audio"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'podcast-audio' AND auth.uid()::text = (storage.foldername(name))[2]);
