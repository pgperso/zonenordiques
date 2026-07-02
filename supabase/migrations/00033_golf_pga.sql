-- Add Golf category and PGA tribune

-- 1. Add Golf category
INSERT INTO public.categories (name, slug, icon, sort_order)
VALUES ('Golf', 'golf', 'golf', 5);

-- 2. Create PGA community
INSERT INTO public.communities (name, slug, description, primary_color, secondary_color, is_active)
VALUES (
  'PGA',
  'pga',
  'La tribune des fans de golf et du PGA Tour. Suivez les tournois, partagez vos analyses et discutez en direct!',
  '#0B4870',
  '#E67E22',
  true
)
ON CONFLICT (slug) DO NOTHING;

-- 3. Link PGA to Golf category
UPDATE public.communities
SET category_id = (SELECT id FROM public.categories WHERE slug = 'golf')
WHERE slug = 'pga';
