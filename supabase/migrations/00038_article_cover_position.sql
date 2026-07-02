-- Add cover_position_y to articles (0-100, default 50 = center)
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS cover_position_y SMALLINT DEFAULT 50;
