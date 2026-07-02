-- Automatic translation of editorial content (articles, podcasts).
--
-- The UI chrome is bilingual via next-intl, and communities/categories
-- carry hand-written name_en columns. But articles and podcasts — the
-- text fans actually read — stay in whatever language they were written
-- in. A reader on /en sees French articles and vice versa.
--
-- This adds the storage for a machine translation of each piece, filled
-- in once by a background worker (see /api/translate-pending) that calls
-- Claude. The translation is computed a single time and cached here
-- forever — never re-translated on read.
--
--   source_lang          the language the piece was written in
--   *_translated         the other-language version (NULL until done)
--   translated_at        when the translation was produced (NULL = pending)
--
-- A BEFORE UPDATE trigger clears translated_at whenever the source text
-- changes, so an edited article is automatically re-translated.

-- ── Articles ─────────────────────────────────────────────────────────

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS source_lang        TEXT NOT NULL DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS title_translated   VARCHAR(500),
  ADD COLUMN IF NOT EXISTS excerpt_translated TEXT,
  ADD COLUMN IF NOT EXISTS body_translated    TEXT,
  ADD COLUMN IF NOT EXISTS translated_at      TIMESTAMPTZ;

-- The worker's queue: published, visible, not yet translated.
CREATE INDEX IF NOT EXISTS idx_articles_untranslated
  ON public.articles(published_at)
  WHERE is_published = TRUE AND is_removed = FALSE AND translated_at IS NULL;

CREATE OR REPLACE FUNCTION public.reset_article_translation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.excerpt IS DISTINCT FROM OLD.excerpt
     OR NEW.body IS DISTINCT FROM OLD.body THEN
    NEW.translated_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_article_translation ON public.articles;
CREATE TRIGGER trg_reset_article_translation
  BEFORE UPDATE ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_article_translation();

-- ── Podcasts ─────────────────────────────────────────────────────────

ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS source_lang             TEXT NOT NULL DEFAULT 'fr',
  ADD COLUMN IF NOT EXISTS title_translated        VARCHAR(500),
  ADD COLUMN IF NOT EXISTS description_translated  TEXT,
  ADD COLUMN IF NOT EXISTS translated_at           TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_podcasts_untranslated
  ON public.podcasts(created_at)
  WHERE translated_at IS NULL;

CREATE OR REPLACE FUNCTION public.reset_podcast_translation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description THEN
    NEW.translated_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_podcast_translation ON public.podcasts;
CREATE TRIGGER trg_reset_podcast_translation
  BEFORE UPDATE ON public.podcasts
  FOR EACH ROW
  EXECUTE FUNCTION public.reset_podcast_translation();
