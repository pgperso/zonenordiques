-- Add article:publish permission to admin and moderator roles

INSERT INTO public.role_permissions (role_id, permission) VALUES
  ((SELECT id FROM public.roles WHERE code = 'admin'), 'article:publish'),
  ((SELECT id FROM public.roles WHERE code = 'moderator'), 'article:publish');
