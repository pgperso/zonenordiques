-- Weekly email digest ("infolettre") with double opt-in.
--
-- Canada's Anti-Spam Legislation (CASL) and Québec Law 25 require express,
-- verifiable consent before sending commercial email. We enforce this with a
-- double opt-in: a subscribe request creates a 'pending' row and sends a
-- confirmation email; only after the recipient clicks the confirm link does
-- the row become 'confirmed' and eligible for the digest. Every digest also
-- carries a per-subscriber one-click unsubscribe link + List-Unsubscribe
-- header (RFC 8058).

CREATE TABLE public.newsletter_subscribers (
  id                BIGSERIAL PRIMARY KEY,
  email             TEXT NOT NULL,
  -- Case-insensitive uniqueness without a citext extension dependency.
  email_lower       TEXT GENERATED ALWAYS AS (lower(email)) STORED,
  locale            TEXT NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr', 'en')),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'confirmed', 'unsubscribed')),
  confirm_token     UUID NOT NULL DEFAULT gen_random_uuid(),
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at      TIMESTAMPTZ,
  unsubscribed_at   TIMESTAMPTZ,
  last_sent_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_newsletter_email_lower ON public.newsletter_subscribers (email_lower);
CREATE UNIQUE INDEX idx_newsletter_confirm_token ON public.newsletter_subscribers (confirm_token);
CREATE UNIQUE INDEX idx_newsletter_unsub_token ON public.newsletter_subscribers (unsubscribe_token);
-- The digest cron scans confirmed subscribers; keep that lookup cheap.
CREATE INDEX idx_newsletter_confirmed ON public.newsletter_subscribers (status)
  WHERE status = 'confirmed';

-- Subscriber emails are personal data: no public/authenticated access at all.
-- Every read/write goes through server routes using the service-role key,
-- which bypasses RLS. Enabling RLS with zero policies denies everyone else.
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Run-log for the weekly send, mirroring nhl_sync_runs: makes a silent cron
-- failure visible after the fact.
CREATE TABLE public.newsletter_sends (
  id             BIGSERIAL PRIMARY KEY,
  status         TEXT NOT NULL DEFAULT 'running'
                   CHECK (status IN ('running', 'ok', 'error', 'skipped')),
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at    TIMESTAMPTZ,
  recipients     INT DEFAULT 0,
  articles_count INT DEFAULT 0,
  error          TEXT
);

ALTER TABLE public.newsletter_sends ENABLE ROW LEVEL SECURITY;
