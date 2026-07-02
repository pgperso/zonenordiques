-- Communities table
CREATE TABLE public.communities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  logo_url TEXT,
  banner_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#0B4870',
  secondary_color VARCHAR(7) DEFAULT '#E67E22',
  is_active BOOLEAN DEFAULT TRUE,
  member_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_communities_slug ON public.communities(slug);
CREATE INDEX idx_communities_active ON public.communities(is_active);
