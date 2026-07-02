-- Expomètre: confidence index for Expos return to Montreal
CREATE TABLE public.exposmetre_votes (
  id SERIAL PRIMARY KEY,
  member_id UUID REFERENCES members(id) NOT NULL,
  vote INT NOT NULL CHECK (vote >= 0 AND vote <= 100),
  horizon TEXT NOT NULL DEFAULT '0-3',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id, horizon)
);

ALTER TABLE public.exposmetre_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Votes are publicly readable"
  ON public.exposmetre_votes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can vote"
  ON public.exposmetre_votes FOR INSERT
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Users can update own vote"
  ON public.exposmetre_votes FOR UPDATE
  USING (auth.uid() = member_id);

CREATE POLICY "Authenticated users can delete votes"
  ON public.exposmetre_votes FOR DELETE
  USING (true);
