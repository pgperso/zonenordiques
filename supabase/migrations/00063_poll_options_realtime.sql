-- Make poll results live.
--
-- cast_poll_vote() bumps poll_options.vote_count, but the home page that
-- shows the poll is ISR-cached — readers were stuck looking at whatever
-- counts existed when the page was last regenerated. PollBlock now
-- re-fetches the counts on mount and subscribes to realtime; this puts
-- poll_options in the realtime publication so those UPDATEs are
-- broadcast and the poll visibly accumulates votes.
--
-- Guarded so it is safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'poll_options'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_options;
  END IF;
END $$;
