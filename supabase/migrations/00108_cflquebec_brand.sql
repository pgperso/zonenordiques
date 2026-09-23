-- Third brand: CFL Québec (cflquebec.com) — football.
--
-- Same pattern as Zone Expos: ONE shared Supabase, members shared across all
-- brands, content separated by sport category. This migration only creates the
-- football flagship tribune; the `football` category already exists (seeded in
-- the initial categories migration) and the brand's look/copy is env-driven on
-- its own Vercel project.
--
-- Idempotent: safe to re-run.

-- Safety net in case the football category was ever removed.
INSERT INTO public.categories (name, slug, icon, sort_order)
VALUES ('Football', 'football', 'football', 3)
ON CONFLICT (slug) DO NOTHING;

-- Flagship tribune for the brand (SITE.mainTribune = 'cfl-quebec'), i.e. the
-- "La Zone" chat shortcut and the community every football article hangs off.
INSERT INTO public.communities (name, slug, description, primary_color, secondary_color, is_active, category_id)
VALUES (
  'CFL Québec',
  'cfl-quebec',
  'L''antichambre du football canadien au Québec : LCF, Alouettes, Coupe Grey.',
  '#0B3D2E',
  '#C8102E',
  TRUE,
  (SELECT id FROM public.categories WHERE slug = 'football')
)
ON CONFLICT (slug) DO UPDATE
  SET category_id = EXCLUDED.category_id,
      is_active   = TRUE;

-- Verify: this should return one row with category 'football'.
--   SELECT c.slug, cat.slug AS category, c.is_active
--   FROM public.communities c
--   JOIN public.categories cat ON cat.id = c.category_id
--   WHERE c.slug = 'cfl-quebec';
