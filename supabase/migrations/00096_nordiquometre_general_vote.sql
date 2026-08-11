-- Nordiquomètre becomes a single GENERAL vote (the "tranches d'année" /
-- horizon concept is dropped). Each member holds exactly one vote, updatable
-- once per day. Collapse any legacy per-horizon rows into the member's most
-- recent vote, drop the horizon column, and enforce one row per member.

-- 1. Keep only the most recent vote per member (robust against NULL updated_at).
DELETE FROM public.nordiquometre_votes
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY member_id
             ORDER BY updated_at DESC NULLS LAST, id DESC
           ) AS rn
    FROM public.nordiquometre_votes
  ) ranked
  WHERE ranked.rn > 1
);

-- 2. Drop the horizon column (also drops any unique constraint that included it).
ALTER TABLE public.nordiquometre_votes DROP COLUMN IF EXISTS horizon;

-- 3. One vote per member from now on.
ALTER TABLE public.nordiquometre_votes
  ADD CONSTRAINT nordiquometre_votes_member_unique UNIQUE (member_id);
