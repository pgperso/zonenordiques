-- Return-confidence meters (Nordiquomètre / Exposmètre): open voting to EVERYONE
-- (anonymous included) and drop the Exposmètre's legacy 3-horizon structure so
-- both meters behave identically — a single general, append-only vote.
--
--   * Both tables gain a `voter_key` (a browser id for anonymous dedup) and make
--     `member_id` nullable (anonymous votes have no member).
--   * exposmetre_votes loses its `horizon` column + the (member_id, horizon)
--     unique, matching nordiquometre_votes (already collapsed in 00096-00098).
--   * cast_meter_vote() is the single write path: SECURITY DEFINER so anonymous
--     visitors can vote, enforcing one vote per identity (member id when logged
--     in, else voter_key) per day. Owners bypass the daily gate (admin testing).
--   * Owners can delete every vote (the meter reset), including anonymous ones.

-- 1. nordiquometre_votes: allow anonymous ------------------------------------
ALTER TABLE public.nordiquometre_votes ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE public.nordiquometre_votes ADD COLUMN IF NOT EXISTS voter_key TEXT;
CREATE INDEX IF NOT EXISTS idx_nordiquometre_voter_key
  ON public.nordiquometre_votes(voter_key) WHERE voter_key IS NOT NULL;

-- 2. exposmetre_votes: drop horizons, allow anonymous ------------------------
ALTER TABLE public.exposmetre_votes DROP CONSTRAINT IF EXISTS exposmetre_votes_member_id_horizon_key;
ALTER TABLE public.exposmetre_votes DROP COLUMN IF EXISTS horizon;
ALTER TABLE public.exposmetre_votes ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE public.exposmetre_votes ADD COLUMN IF NOT EXISTS voter_key TEXT;
CREATE INDEX IF NOT EXISTS idx_exposmetre_voter_key
  ON public.exposmetre_votes(voter_key) WHERE voter_key IS NOT NULL;

-- 3. Single write path: anonymous-capable, one vote per identity per day ------
CREATE OR REPLACE FUNCTION public.cast_meter_vote(
  p_meter TEXT,
  p_vote INT,
  p_voter_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table  TEXT;
  v_uid    UUID := auth.uid();
  v_owner  BOOLEAN := public.is_global_owner();
  v_exists BOOLEAN;
BEGIN
  IF p_meter NOT IN ('nordiquometre', 'exposmetre') THEN RETURN 'invalid_meter'; END IF;
  IF p_vote IS NULL OR p_vote < 0 OR p_vote > 100 THEN RETURN 'invalid_vote'; END IF;
  v_table := p_meter || '_votes';

  -- Daily gate (owners excepted): one vote per identity per calendar day.
  IF NOT v_owner THEN
    IF v_uid IS NOT NULL THEN
      EXECUTE format(
        'SELECT EXISTS(SELECT 1 FROM public.%I WHERE member_id = $1 AND created_at::date = CURRENT_DATE)',
        v_table
      ) INTO v_exists USING v_uid;
    ELSE
      IF p_voter_key IS NULL OR length(trim(p_voter_key)) < 8 THEN RETURN 'invalid_voter'; END IF;
      EXECUTE format(
        'SELECT EXISTS(SELECT 1 FROM public.%I WHERE voter_key = $1 AND created_at::date = CURRENT_DATE)',
        v_table
      ) INTO v_exists USING p_voter_key;
    END IF;
    IF v_exists THEN RETURN 'already_voted'; END IF;
  END IF;

  EXECUTE format(
    'INSERT INTO public.%I (member_id, voter_key, vote) VALUES ($1, $2, $3)',
    v_table
  ) USING v_uid, CASE WHEN v_uid IS NULL THEN p_voter_key ELSE NULL END, p_vote;

  RETURN 'ok';
END;
$$;

REVOKE ALL ON FUNCTION public.cast_meter_vote(TEXT, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cast_meter_vote(TEXT, INT, TEXT) TO anon, authenticated;

-- 4. Owner can wipe every vote (meter reset), anonymous ones included ---------
DROP POLICY IF EXISTS "Owner can delete all nordiquometre votes" ON public.nordiquometre_votes;
CREATE POLICY "Owner can delete all nordiquometre votes"
  ON public.nordiquometre_votes FOR DELETE USING (public.is_global_owner());

DROP POLICY IF EXISTS "Owner can delete all exposmetre votes" ON public.exposmetre_votes;
CREATE POLICY "Owner can delete all exposmetre votes"
  ON public.exposmetre_votes FOR DELETE USING (public.is_global_owner());
