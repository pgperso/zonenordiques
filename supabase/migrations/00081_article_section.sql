-- Article theme/section for the Zone Nordiques gallery taxonomy.
--   nordiques : Nordiques de Québec (main theme; all legacy imports default here)
--   lnh       : LNH / NHL general
--   taverne   : La Taverne (off-topic; own dedicated gallery block)
-- Existing 631 imported articles inherit the default 'nordiques'.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'nordiques'
  CHECK (section IN ('nordiques', 'lnh', 'taverne'));

CREATE INDEX IF NOT EXISTS idx_articles_section ON public.articles(section);
