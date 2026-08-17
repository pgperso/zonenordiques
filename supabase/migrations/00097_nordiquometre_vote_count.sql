-- Track the total number of votes CAST (not just distinct voters). Each member
-- still holds one row (one current opinion, used for the average index), but
-- re-voting on later days increments this counter, so the meter can show
-- "N votes" as an engagement number distinct from the voter count.

ALTER TABLE public.nordiquometre_votes
  ADD COLUMN IF NOT EXISTS vote_count INT NOT NULL DEFAULT 1;
