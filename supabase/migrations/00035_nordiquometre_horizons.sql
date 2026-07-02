-- Add time horizon dimension to nordiquometre votes
-- Horizons: '0-3' (0-3 years), '3-5' (3-5 years), '5-10' (5-10 years)

ALTER TABLE public.nordiquometre_votes
  ADD COLUMN IF NOT EXISTS horizon TEXT NOT NULL DEFAULT '0-3';

-- Drop old unique constraint (1 vote per user)
ALTER TABLE public.nordiquometre_votes
  DROP CONSTRAINT IF EXISTS nordiquometre_votes_member_id_key;

-- New constraint: 1 vote per user PER horizon
ALTER TABLE public.nordiquometre_votes
  ADD CONSTRAINT nordiquometre_votes_member_horizon_key
  UNIQUE(member_id, horizon);
