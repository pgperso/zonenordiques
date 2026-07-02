-- Articles — "hide from the community chat feed" without unpublishing.
--
-- The community feed/chat surfaces an "Article" promo card for every published
-- article. Removing that promo used to set is_published=false, which ALSO
-- pulled the article from the press gallery. This flag lets a moderator hide
-- the promo from the chat while the article stays published in the gallery.
--
-- Feed/chat queries filter hidden_from_feed=false; the press gallery ignores it.

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS hidden_from_feed BOOLEAN NOT NULL DEFAULT false;
