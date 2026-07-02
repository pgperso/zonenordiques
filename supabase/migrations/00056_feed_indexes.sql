-- Performance indexes for the public feed query paths.
--
-- The home gallery, /sport/[category] hubs, author pages, the sitemap
-- and the "Top of the week" widget all filter articles on
-- (is_published, is_removed) and sort by published_at or view_count.
-- Without these indexes every one of those reads was a full sequential
-- scan of the articles table — cheap when the table is small, but it
-- pinned the Supabase Disk IO budget once the legacy archive was
-- imported, causing site-wide timeouts.
--
-- Partial indexes (WHERE is_published AND NOT is_removed) keep the
-- indexes small: they only cover rows that can actually appear in a
-- public feed.
--
-- These were first created directly against production during an
-- incident; this migration records them so a fresh environment
-- (db reset / new branch) gets the same schema.

CREATE INDEX IF NOT EXISTS idx_articles_feed
  ON public.articles (published_at DESC)
  WHERE is_published = true AND is_removed = false;

CREATE INDEX IF NOT EXISTS idx_articles_views
  ON public.articles (view_count DESC)
  WHERE is_published = true AND is_removed = false;

CREATE INDEX IF NOT EXISTS idx_articles_community
  ON public.articles (community_id, published_at DESC)
  WHERE is_published = true AND is_removed = false;

CREATE INDEX IF NOT EXISTS idx_articles_author
  ON public.articles (author_id, published_at DESC)
  WHERE is_published = true AND is_removed = false;

CREATE INDEX IF NOT EXISTS idx_podcasts_feed
  ON public.podcasts (created_at DESC)
  WHERE is_published = true;
