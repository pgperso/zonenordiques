-- Chat messages
CREATE TABLE public.chat_messages (
  id BIGSERIAL PRIMARY KEY,
  community_id INT REFERENCES public.communities(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.members(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  is_removed BOOLEAN DEFAULT FALSE,
  removed_at TIMESTAMPTZ,
  removed_by UUID REFERENCES public.members(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_community ON public.chat_messages(community_id, created_at DESC);
CREATE INDEX idx_chat_messages_member ON public.chat_messages(member_id);

-- Chat presence tracking
CREATE TABLE public.chat_presence (
  id SERIAL PRIMARY KEY,
  community_id INT REFERENCES public.communities(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.members(id) ON DELETE CASCADE,
  client_type VARCHAR(20) DEFAULT 'web',
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(community_id, member_id)
);

-- Enable realtime on chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
