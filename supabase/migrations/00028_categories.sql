-- Sport categories for tribunes
CREATE TABLE public.categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  icon VARCHAR(50) DEFAULT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are readable by all"
  ON public.categories FOR SELECT USING (true);

-- Link communities to categories
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS category_id INT REFERENCES public.categories(id);

CREATE INDEX IF NOT EXISTS idx_communities_category
  ON public.communities(category_id);

-- Seed categories
INSERT INTO public.categories (name, slug, icon, sort_order) VALUES
  ('Hockey', 'hockey', 'hockey', 1),
  ('Baseball', 'baseball', 'baseball', 2),
  ('Football', 'football', 'football', 3),
  ('Soccer', 'soccer', 'soccer', 4);

-- Assign existing tribunes to categories (update slugs to match your actual community slugs)
UPDATE public.communities SET category_id = (SELECT id FROM public.categories WHERE slug = 'hockey')
  WHERE slug IN ('nordiques-de-quebec', 'canadiens-de-montreal', 'remparts-de-quebec', 'rocket-de-laval');

UPDATE public.communities SET category_id = (SELECT id FROM public.categories WHERE slug = 'baseball')
  WHERE slug IN ('expos-de-montreal', 'blue-jays-de-toronto');

UPDATE public.communities SET category_id = (SELECT id FROM public.categories WHERE slug = 'soccer')
  WHERE slug IN ('cf-montreal');

UPDATE public.communities SET category_id = (SELECT id FROM public.categories WHERE slug = 'football')
  WHERE slug IN ('alouettes-de-montreal', 'patriots', 'bills', 'packers', 'cowboys', 'chiefs');
