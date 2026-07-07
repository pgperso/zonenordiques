-- Mirror the articles.hidden_from_feed flag on podcasts so podcast promos can
-- be removed from the chat/feed while staying visible in the press gallery
-- (the gallery ignores this flag). Hide the 46 imported Zone Nordiques
-- podcasts so the launch chat is empty.
ALTER TABLE public.podcasts
  ADD COLUMN IF NOT EXISTS hidden_from_feed BOOLEAN NOT NULL DEFAULT false;

UPDATE public.podcasts SET hidden_from_feed = true WHERE community_id = 11;
