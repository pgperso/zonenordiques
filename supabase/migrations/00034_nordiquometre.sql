-- Nordiquomètre: confidence index for Nordiques return
CREATE TABLE public.nordiquometre_votes (
  id SERIAL PRIMARY KEY,
  member_id UUID REFERENCES members(id) NOT NULL,
  vote INT NOT NULL CHECK (vote >= 0 AND vote <= 100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(member_id) -- 1 vote par personne, peut être mis à jour
);

-- RLS
ALTER TABLE public.nordiquometre_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Votes are publicly readable"
  ON public.nordiquometre_votes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can vote"
  ON public.nordiquometre_votes FOR INSERT
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Users can update own vote"
  ON public.nordiquometre_votes FOR UPDATE
  USING (auth.uid() = member_id);
