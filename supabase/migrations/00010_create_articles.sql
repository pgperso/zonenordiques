-- Articles system for community content publishing

CREATE TABLE public.articles (
  id SERIAL PRIMARY KEY,
  community_id INT NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(200) NOT NULL,
  excerpt TEXT,
  body TEXT NOT NULL,
  cover_image_url TEXT,
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  like_count INT DEFAULT 0,
  view_count INT DEFAULT 0,
  is_removed BOOLEAN DEFAULT FALSE,
  removed_at TIMESTAMPTZ,
  removed_by UUID REFERENCES public.members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(community_id, slug)
);

CREATE INDEX idx_articles_community_published ON public.articles(community_id, published_at DESC)
  WHERE is_published = TRUE AND is_removed = FALSE;
CREATE INDEX idx_articles_author ON public.articles(author_id);

-- Article likes
CREATE TABLE public.article_likes (
  id BIGSERIAL PRIMARY KEY,
  article_id INT NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(article_id, member_id)
);

CREATE INDEX idx_article_likes_article ON public.article_likes(article_id);

-- Trigger for article like count
CREATE OR REPLACE FUNCTION update_article_like_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.articles SET like_count = like_count + 1 WHERE id = NEW.article_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.articles SET like_count = like_count - 1 WHERE id = OLD.article_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_article_like_count
AFTER INSERT OR DELETE ON public.article_likes
FOR EACH ROW EXECUTE FUNCTION update_article_like_count();

-- Enable realtime for articles
ALTER PUBLICATION supabase_realtime ADD TABLE public.articles;

-- RLS for articles
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published articles are publicly readable"
  ON public.articles FOR SELECT
  USING (is_published = TRUE AND is_removed = FALSE);

CREATE POLICY "Authors can read own drafts"
  ON public.articles FOR SELECT
  USING (auth.uid() = author_id);

CREATE POLICY "Privileged members can insert articles"
  ON public.articles FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.community_id = articles.community_id
        AND cmr.member_id = auth.uid()
        AND r.code IN ('admin', 'moderator')
    )
  );

CREATE POLICY "Authors can update own articles"
  ON public.articles FOR UPDATE
  USING (auth.uid() = author_id);

CREATE POLICY "Moderators can update any article"
  ON public.articles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.community_id = articles.community_id
        AND cmr.member_id = auth.uid()
        AND r.code IN ('admin', 'moderator')
    )
  );

-- RLS for article likes
ALTER TABLE public.article_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Article likes are publicly readable"
  ON public.article_likes FOR SELECT USING (true);

CREATE POLICY "Authenticated users can like articles"
  ON public.article_likes FOR INSERT
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Members can unlike their own article likes"
  ON public.article_likes FOR DELETE
  USING (auth.uid() = member_id);
