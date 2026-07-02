-- Article comments for Press Gallery and article detail pages
CREATE TABLE public.article_comments (
  id BIGSERIAL PRIMARY KEY,
  article_id INTEGER NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ,
  is_removed BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_article_comments_article_id ON public.article_comments(article_id);
CREATE INDEX idx_article_comments_member_id ON public.article_comments(member_id);
CREATE INDEX idx_article_comments_created_at ON public.article_comments(created_at DESC);

-- RLS
ALTER TABLE public.article_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read non-removed comments
CREATE POLICY "Comments are publicly readable"
  ON public.article_comments FOR SELECT
  USING (is_removed = false);

-- Authenticated users can insert their own comments
CREATE POLICY "Authenticated users can comment"
  ON public.article_comments FOR INSERT
  WITH CHECK (auth.uid() = member_id);

-- Users can update their own comments
CREATE POLICY "Users can update own comments"
  ON public.article_comments FOR UPDATE
  USING (auth.uid() = member_id);

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments"
  ON public.article_comments FOR DELETE
  USING (auth.uid() = member_id);
