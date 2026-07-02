-- Optional author name override on articles
-- When set, displays this name instead of the creator profile name
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS author_name_override TEXT;
