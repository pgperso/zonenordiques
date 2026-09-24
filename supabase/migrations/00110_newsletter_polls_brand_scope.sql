-- Give the newsletter list and the reader poll a brand, so the three sites
-- stop sharing them.
--
-- Both tables predate the multibrand split and have no brand column, which
-- the application layer cannot work around:
--
--  * newsletter_subscribers — the weekly cron selects EVERY confirmed
--    subscriber, so someone who signed up on cflquebec.com receives three
--    digests a week (hockey, baseball, football). `email_lower` is globally
--    UNIQUE, so a hockey subscriber who signs up on Zone Expos silently hits
--    the "already subscribed" path and never joins the baseball list at all.
--    Under CASL and Law 25 consent is given for a specific sender and a
--    specific purpose; mailing all three off one opt-in does not meet that.
--
--  * polls — one active poll for all brands: approving a hockey question
--    makes it appear in the football site's sidebar, and the three owners
--    share one moderation queue.
--
-- Idempotent: safe to re-run.

-- ── 1. Newsletter subscribers ────────────────────────────────────────
-- Existing rows are attributed to zonenordiques: it is the oldest and
-- largest list, and the alternative (leaving them unattributed, i.e. served
-- by every brand) is exactly the behaviour being removed. Attributing
-- wrongly here under-sends, which is the safe direction for consent.
ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS brand_id TEXT NOT NULL DEFAULT 'zonenordiques';

-- One subscription per address PER BRAND, instead of one globally.
DROP INDEX IF EXISTS public.idx_newsletter_email_lower;
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_email_lower_brand
  ON public.newsletter_subscribers (email_lower, brand_id);

-- The weekly cron scans confirmed subscribers of ONE brand.
DROP INDEX IF EXISTS public.idx_newsletter_confirmed;
CREATE INDEX IF NOT EXISTS idx_newsletter_confirmed_brand
  ON public.newsletter_subscribers (brand_id, status)
  WHERE status = 'confirmed';

-- The run-log is per brand too, otherwise the three crons read each other's
-- "already sent this week" row and two of them skip.
ALTER TABLE public.newsletter_sends
  ADD COLUMN IF NOT EXISTS brand_id TEXT NOT NULL DEFAULT 'zonenordiques';

CREATE INDEX IF NOT EXISTS idx_newsletter_sends_brand
  ON public.newsletter_sends (brand_id, started_at DESC);

-- ── 2. Reader polls ──────────────────────────────────────────────────
-- Scoped by sport category rather than by brand id, so the poll follows the
-- content model the rest of the app uses (categories.slug = hockey |
-- baseball | football) and a future second hockey brand would share it.
ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS category_id INT REFERENCES public.categories(id) ON DELETE CASCADE;

UPDATE public.polls
  SET category_id = (SELECT id FROM public.categories WHERE slug = 'hockey')
  WHERE category_id IS NULL;

-- The sidebar reads "the active poll of my category"; the admin queue reads
-- "pending/scheduled polls of my category". Both are (category_id, status).
-- Not a UNIQUE index: "one active poll per category" is enforced by the
-- approve/rotate routes, and adding the constraint here would abort the
-- whole migration if production happens to hold two active rows.
CREATE INDEX IF NOT EXISTS idx_polls_category_status
  ON public.polls (category_id, status);

-- ── Verification ─────────────────────────────────────────────────────
-- A) Subscribers per brand — all existing rows should read 'zonenordiques'.
--      SELECT brand_id, status, COUNT(*) FROM public.newsletter_subscribers
--      GROUP BY brand_id, status ORDER BY brand_id, status;
--
-- B) No poll left without a category (would be invisible everywhere).
--      SELECT COUNT(*) AS sans_categorie FROM public.polls WHERE category_id IS NULL;
--
-- C) Should return no row: more than one active poll in a category would
--    mean the sidebar picks one arbitrarily.
--      SELECT category_id, COUNT(*) FROM public.polls WHERE status = 'active'
--      GROUP BY category_id HAVING COUNT(*) > 1;
