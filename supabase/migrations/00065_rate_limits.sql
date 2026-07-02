-- Persistent, distributed rate limiting.
--
-- Context: the API routes (article generation, legacy-login) previously
-- rate-limited with an in-process `Map`. On Vercel each serverless instance
-- has its own memory, so the real ceiling was `limit × instance_count` and
-- it reset on every cold start / redeploy. For a cost guard (4 Opus calls
-- per article) and a brute-force guard (legacy MD5 login) that is no guard
-- at all.
--
-- This table is the shared counter. A single SECURITY DEFINER function does
-- a fixed-window check atomically (the ON CONFLICT upsert takes a row lock,
-- so concurrent callers serialize on the key).

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          TEXT PRIMARY KEY,
  count        INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Locked down: only the SECURITY DEFINER function below and the service role
-- (which bypasses RLS) ever touch this table. RLS on with no policies means
-- the anon/authenticated roles get nothing.
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Atomically register one hit against `p_key` and report whether it is
-- allowed under a fixed window of `p_window_seconds` capped at `p_max`.
--
-- Returns:
--   allowed   - true when this hit is within the limit
--   remaining - hits left in the current window (0 once exhausted)
--   reset_at  - when the current window expires
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_key            TEXT,
  p_max            INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now      TIMESTAMPTZ := now();
  v_window   INTERVAL := make_interval(secs => p_window_seconds);
  v_count    INTEGER;
  v_start    TIMESTAMPTZ;
BEGIN
  INSERT INTO public.rate_limits AS rl (key, count, window_start)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE
    -- Window expired -> start a fresh one at 1; otherwise increment.
    SET count = CASE
          WHEN rl.window_start + v_window <= v_now THEN 1
          ELSE rl.count + 1
        END,
        window_start = CASE
          WHEN rl.window_start + v_window <= v_now THEN v_now
          ELSE rl.window_start
        END
  RETURNING rl.count, rl.window_start INTO v_count, v_start;

  RETURN QUERY SELECT
    v_count <= p_max,
    GREATEST(p_max - v_count, 0),
    v_start + v_window;
END;
$$;

-- Only the service role may call this. The key is chosen by the caller, so
-- exposing it to `authenticated` would let any user exhaust another user's
-- quota by passing their id. API routes call it through a service-role client.
REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- Housekeeping: prune windows that expired over a day ago. Safe to run from a
-- scheduled job; the table is tiny so this is opportunistic, not critical.
CREATE OR REPLACE FUNCTION public.prune_rate_limits()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.rate_limits
  WHERE window_start < now() - INTERVAL '1 day';
$$;

REVOKE ALL ON FUNCTION public.prune_rate_limits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_rate_limits() TO service_role;
