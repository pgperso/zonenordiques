-- Seed initial community: Nordiques de Québec
INSERT INTO public.communities (name, slug, description, primary_color, secondary_color, is_active)
VALUES (
  'Nordiques de Québec',
  'nordiques-quebec',
  'La communauté des fans des Nordiques de Québec. Rejoignez le chat et discutez en direct!',
  '#0B4870',
  '#E67E22',
  true
)
ON CONFLICT (slug) DO NOTHING;
