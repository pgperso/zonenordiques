-- Roles
CREATE TABLE public.roles (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL
);

-- Role permissions
CREATE TABLE public.role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INT REFERENCES public.roles(id) ON DELETE CASCADE,
  permission VARCHAR(100) NOT NULL,
  UNIQUE(role_id, permission)
);

-- Community member roles (scoped per community)
CREATE TABLE public.community_member_roles (
  id SERIAL PRIMARY KEY,
  community_id INT REFERENCES public.communities(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
  role_id INT REFERENCES public.roles(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES public.members(id),
  UNIQUE(community_id, member_id, role_id)
);

CREATE INDEX idx_cmr_community_member ON public.community_member_roles(community_id, member_id);

-- Member restrictions (scoped per community)
CREATE TABLE public.member_restrictions (
  id SERIAL PRIMARY KEY,
  community_id INT REFERENCES public.communities(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
  restriction_type VARCHAR(50) NOT NULL,
  reason TEXT,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.members(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_restrictions_member ON public.member_restrictions(community_id, member_id);

-- Seed roles
INSERT INTO public.roles (code, name) VALUES
  ('admin', 'Administrateur'),
  ('moderator', 'Modérateur'),
  ('member', 'Membre');

-- Seed permissions
INSERT INTO public.role_permissions (role_id, permission) VALUES
  -- Admin permissions
  ((SELECT id FROM public.roles WHERE code = 'admin'), 'chat:moderate'),
  ((SELECT id FROM public.roles WHERE code = 'admin'), 'podcast:upload'),
  ((SELECT id FROM public.roles WHERE code = 'admin'), 'member:manage'),
  ((SELECT id FROM public.roles WHERE code = 'admin'), 'member:restrict'),
  ((SELECT id FROM public.roles WHERE code = 'admin'), 'community:manage'),
  -- Moderator permissions
  ((SELECT id FROM public.roles WHERE code = 'moderator'), 'chat:moderate'),
  ((SELECT id FROM public.roles WHERE code = 'moderator'), 'podcast:upload'),
  ((SELECT id FROM public.roles WHERE code = 'moderator'), 'member:restrict');
