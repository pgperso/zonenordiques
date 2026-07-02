-- Enrich podcasts with cover image, published state, and likes

ALTER TABLE public.podcasts
  ADD COLUMN cover_image_url TEXT,
  ADD COLUMN is_published BOOLEAN DEFAULT TRUE,
  ADD COLUMN like_count INT DEFAULT 0;

-- Enable realtime for podcasts
ALTER PUBLICATION supabase_realtime ADD TABLE public.podcasts;

-- Podcast likes
CREATE TABLE public.podcast_likes (
  id BIGSERIAL PRIMARY KEY,
  podcast_id INT NOT NULL REFERENCES public.podcasts(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(podcast_id, member_id)
);

CREATE INDEX idx_podcast_likes_podcast ON public.podcast_likes(podcast_id);

-- Trigger for podcast like count
CREATE OR REPLACE FUNCTION update_podcast_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.podcasts SET like_count = like_count + 1 WHERE id = NEW.podcast_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.podcasts SET like_count = like_count - 1 WHERE id = OLD.podcast_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_podcast_like_count
AFTER INSERT OR DELETE ON public.podcast_likes
FOR EACH ROW EXECUTE FUNCTION update_podcast_like_count();

-- RLS for podcast likes
ALTER TABLE public.podcast_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Podcast likes are publicly readable"
  ON public.podcast_likes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can like podcasts"
  ON public.podcast_likes FOR INSERT
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Members can unlike their own podcast likes"
  ON public.podcast_likes FOR DELETE
  USING (auth.uid() = member_id);
