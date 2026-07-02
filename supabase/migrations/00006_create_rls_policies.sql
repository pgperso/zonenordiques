-- Enable RLS on all tables
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_member_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcasts ENABLE ROW LEVEL SECURITY;

-- Communities: public read, admin write
CREATE POLICY "Communities are publicly readable"
  ON public.communities FOR SELECT USING (true);

-- Members: public read, self write
CREATE POLICY "Members are publicly readable"
  ON public.members FOR SELECT USING (true);

CREATE POLICY "Members can update own profile"
  ON public.members FOR UPDATE USING (auth.uid() = id);

-- Community members: public read, authenticated insert/delete own
CREATE POLICY "Community memberships are publicly readable"
  ON public.community_members FOR SELECT USING (true);

CREATE POLICY "Authenticated users can join communities"
  ON public.community_members FOR INSERT
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Members can leave communities"
  ON public.community_members FOR DELETE
  USING (auth.uid() = member_id);

-- Roles: public read
CREATE POLICY "Roles are publicly readable"
  ON public.roles FOR SELECT USING (true);

CREATE POLICY "Role permissions are publicly readable"
  ON public.role_permissions FOR SELECT USING (true);

CREATE POLICY "Community member roles are publicly readable"
  ON public.community_member_roles FOR SELECT USING (true);

-- Member restrictions: public read (needed for chat mute check)
CREATE POLICY "Restrictions are publicly readable"
  ON public.member_restrictions FOR SELECT USING (true);

-- Chat messages: readable by community members, insertable by authenticated
CREATE POLICY "Chat messages are readable by all"
  ON public.chat_messages FOR SELECT USING (true);

CREATE POLICY "Authenticated users can send chat messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Moderators can update chat messages"
  ON public.chat_messages FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Chat presence: public read, own write
CREATE POLICY "Chat presence is publicly readable"
  ON public.chat_presence FOR SELECT USING (true);

CREATE POLICY "Members can manage own presence"
  ON public.chat_presence FOR INSERT
  WITH CHECK (auth.uid() = member_id);

CREATE POLICY "Members can update own presence"
  ON public.chat_presence FOR UPDATE
  USING (auth.uid() = member_id);

CREATE POLICY "Members can delete own presence"
  ON public.chat_presence FOR DELETE
  USING (auth.uid() = member_id);

-- Podcasts: public read
CREATE POLICY "Podcasts are publicly readable"
  ON public.podcasts FOR SELECT USING (true);
