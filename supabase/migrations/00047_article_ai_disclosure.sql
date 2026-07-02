-- AI disclosure on articles (Google AdSense / Google Search policy compliance).
--
-- Context: Google's Quality Guidelines updated in 2024-2025 flag "scaled
-- content abuse" — mass-generated AI content without disclosure. Articles
-- produced by the /api/articles/generate endpoint (Anthropic multi-agent
-- pipeline) must be marked explicitly so:
--   1. The front-end shows an "Article généré avec assistance IA" badge
--   2. Google's crawlers receive honest metadata
--   3. The site demonstrates E-E-A-T good faith
--
-- IMPORTANT: Legacy articles imported from Zone Nordiques (batch of
-- 2026-03-30) are HUMAN-WRITTEN chronicles from the old PHP site (2012-2026).
-- The import script (scripts/import-chroniques.ts) inserts the original HTML
-- directly — no AI processing. So those articles stay is_ai_generated = FALSE.
-- Only articles generated AFTER this migration via the editor's "Generate
-- with AI" button will flip the flag to TRUE.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE NOT NULL;

COMMENT ON COLUMN public.articles.is_ai_generated IS
  'Whether this article was generated with AI assistance. Used to render the '
  'AI disclosure badge on the public article page and to inform schema.org '
  'metadata (E-E-A-T compliance with Google''s scaled-content policy).';

CREATE INDEX IF NOT EXISTS idx_articles_is_ai_generated
  ON public.articles(is_ai_generated)
  WHERE is_ai_generated = TRUE;
