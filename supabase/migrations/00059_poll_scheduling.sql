-- Scheduled poll rotation.
--
-- Migration 00058 had one active poll and a manual "approve = go live
-- now" step. This adds a dated publication queue: the owner approves
-- polls with a scheduled_for date, and a daily cron (/api/polls/rotate)
-- promotes a poll to 'active' once its date arrives — so a whole
-- batch can be approved in advance and rotates automatically.
--
-- New status 'scheduled': approved + dated, waiting in the queue.
-- Status flow: pending_review -> scheduled -> active -> archived
--              (rejected is the discard path from pending_review)

ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ;

-- Widen the status CHECK to allow 'scheduled'. The original constraint
-- was created inline in 00058, so PostgreSQL named it polls_status_check.
ALTER TABLE public.polls DROP CONSTRAINT IF EXISTS polls_status_check;
ALTER TABLE public.polls ADD CONSTRAINT polls_status_check
  CHECK (status IN ('pending_review', 'scheduled', 'active', 'archived', 'rejected'));

-- The rotation cron scans for due scheduled polls; index that lookup.
CREATE INDEX IF NOT EXISTS idx_polls_scheduled
  ON public.polls(scheduled_for) WHERE status = 'scheduled';
