-- YouTube Live support: embed YouTube videos in podcasts
ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS youtube_video_id VARCHAR(20) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_live BOOLEAN DEFAULT FALSE;

-- Fast lookup for active lives per community
CREATE INDEX IF NOT EXISTS idx_podcasts_live
  ON public.podcasts(community_id, is_live)
  WHERE is_live = true;
