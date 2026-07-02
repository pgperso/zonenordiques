-- Podcasts
CREATE TABLE public.podcasts (
  id SERIAL PRIMARY KEY,
  community_id INT REFERENCES public.communities(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  audio_url TEXT NOT NULL,
  duration_seconds INT,
  published_by UUID REFERENCES public.members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_podcasts_community ON public.podcasts(community_id, created_at DESC);
