-- ============================================================
-- 00090: Full-text search on articles (French)
--
-- Adds a generated tsvector column over title + excerpt (French config,
-- with accent/stemming handling) plus a GIN index, so the /recherche page
-- can run fast websearch queries. Body is intentionally excluded (it's raw
-- HTML); title + excerpt give clean, relevant matches.
-- ============================================================

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('french', coalesce(title, '') || ' ' || coalesce(excerpt, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_articles_fts ON public.articles USING GIN (fts);
