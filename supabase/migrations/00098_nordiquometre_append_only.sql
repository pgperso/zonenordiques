-- Nordiquomètre becomes an append-only vote log: every vote (one per member
-- per day) is kept forever and counts in the GLOBAL average, instead of a
-- member's latest vote overwriting their previous one. Drop the one-row-per-
-- member constraint so a member can accumulate one row per day.

ALTER TABLE public.nordiquometre_votes
  DROP CONSTRAINT IF EXISTS nordiquometre_votes_member_unique;
