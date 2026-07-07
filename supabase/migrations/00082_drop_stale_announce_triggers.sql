-- Remove the DB-side auto-announce triggers for new articles/podcasts.
--
-- They duplicated the application's own bot announcements (botService
-- announceArticle/announcePodcast, fired on publish via the app) AND used a
-- stale "/communities/<slug>/..." link (the app uses "/tribunes/..."). The
-- bulk legacy import — which inserts rows directly — fired these triggers 573
-- times and flooded the Zone Nordiques chat with broken-link announcements.
--
-- Dropping them means:
--   • app-published content still announces once, correctly (JS side);
--   • direct/bulk inserts no longer spam the feed.
DROP TRIGGER IF EXISTS trg_announce_article ON public.articles;
DROP TRIGGER IF EXISTS trg_announce_podcast ON public.podcasts;
