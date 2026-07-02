-- Reader polls for the press gallery.
--
-- A single poll is "active" at a time and shown in the gallery sidebar.
-- The AI generation route proposes new polls with status
-- 'pending_review'; the site owner validates one in the Vestiaire admin
-- panel, which flips it to 'active' and archives the previous one.
--
-- Voting is open to everyone, logged-in or not. Deduplication is by
-- voter_key — a UUID the browser stores in localStorage. This is not
-- fraud-proof (a determined user can clear storage), but it is the
-- right trade-off for a fan poll: it keeps participation frictionless
-- while stopping casual double-voting.

-- ─── Helper: is the current user a global owner? ───
-- Used by RLS so the owner can read/manage pending polls. SECURITY
-- DEFINER so the role lookup itself isn't blocked by RLS.
CREATE OR REPLACE FUNCTION public.is_global_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.community_member_roles cmr
    JOIN public.roles r ON r.id = cmr.role_id
    WHERE cmr.member_id = auth.uid() AND r.code = 'owner'
  );
$$;

-- ─── Tables ───

CREATE TABLE IF NOT EXISTS public.polls (
  id BIGSERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'active', 'archived', 'rejected')),
  created_by TEXT NOT NULL DEFAULT 'ai'
    CHECK (created_by IN ('ai', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_polls_status ON public.polls(status);

CREATE TABLE IF NOT EXISTS public.poll_options (
  id BIGSERIAL PRIMARY KEY,
  poll_id BIGINT NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  vote_count INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON public.poll_options(poll_id);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id BIGSERIAL PRIMARY KEY,
  poll_id BIGINT NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_id BIGINT NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  voter_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One vote per browser per poll.
CREATE UNIQUE INDEX IF NOT EXISTS idx_poll_votes_unique
  ON public.poll_votes(poll_id, voter_key);

-- ─── RLS ───

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- Active poll is world-readable; the owner additionally sees drafts.
DROP POLICY IF EXISTS "Active polls are public" ON public.polls;
CREATE POLICY "Active polls are public" ON public.polls
  FOR SELECT USING (status = 'active' OR public.is_global_owner());

DROP POLICY IF EXISTS "Owners manage polls" ON public.polls;
CREATE POLICY "Owners manage polls" ON public.polls
  FOR ALL USING (public.is_global_owner()) WITH CHECK (public.is_global_owner());

DROP POLICY IF EXISTS "Poll options follow poll visibility" ON public.poll_options;
CREATE POLICY "Poll options follow poll visibility" ON public.poll_options
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.polls p
      WHERE p.id = poll_id
        AND (p.status = 'active' OR public.is_global_owner())
    )
  );

DROP POLICY IF EXISTS "Owners manage poll options" ON public.poll_options;
CREATE POLICY "Owners manage poll options" ON public.poll_options
  FOR ALL USING (public.is_global_owner()) WITH CHECK (public.is_global_owner());

-- Votes are publicly readable (aggregate transparency). They can only
-- be created through cast_poll_vote() below — no direct INSERT policy,
-- so RLS denies raw client inserts.
DROP POLICY IF EXISTS "Votes are publicly readable" ON public.poll_votes;
CREATE POLICY "Votes are publicly readable" ON public.poll_votes
  FOR SELECT USING (true);

-- ─── Vote RPC ───
-- SECURITY DEFINER so it can insert the vote and bump the denormalised
-- vote_count past RLS. Dedup is enforced by the unique index; a second
-- vote from the same voter_key is a silent no-op that returns
-- 'already_voted'.
CREATE OR REPLACE FUNCTION public.cast_poll_vote(
  p_poll_id BIGINT,
  p_option_id BIGINT,
  p_voter_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows INT;
BEGIN
  IF p_voter_key IS NULL OR length(trim(p_voter_key)) < 8 THEN
    RETURN 'invalid_voter';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.polls WHERE id = p_poll_id AND status = 'active'
  ) THEN
    RETURN 'poll_inactive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.poll_options WHERE id = p_option_id AND poll_id = p_poll_id
  ) THEN
    RETURN 'invalid_option';
  END IF;

  INSERT INTO public.poll_votes (poll_id, option_id, member_id, voter_key)
  VALUES (p_poll_id, p_option_id, auth.uid(), p_voter_key)
  ON CONFLICT (poll_id, voter_key) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows > 0 THEN
    UPDATE public.poll_options
    SET vote_count = vote_count + 1
    WHERE id = p_option_id;
    RETURN 'ok';
  END IF;

  RETURN 'already_voted';
END;
$$;

GRANT EXECUTE ON FUNCTION public.cast_poll_vote(BIGINT, BIGINT, TEXT) TO anon, authenticated;
