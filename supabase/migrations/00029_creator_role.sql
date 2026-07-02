-- Creator role: can publish articles and podcasts, nothing else
INSERT INTO public.roles (code, name) VALUES
  ('creator', 'Créateur de contenu')
ON CONFLICT (code) DO NOTHING;

-- Creator permissions
INSERT INTO public.role_permissions (role_id, permission) VALUES
  ((SELECT id FROM public.roles WHERE code = 'creator'), 'article:publish'),
  ((SELECT id FROM public.roles WHERE code = 'creator'), 'podcast:upload')
ON CONFLICT DO NOTHING;

-- Creator profile fields on members table
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS creator_display_name VARCHAR(100) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS creator_avatar_url TEXT DEFAULT NULL;
