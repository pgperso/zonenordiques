-- Fix chat_messages UPDATE policy: only message author can update
DROP POLICY IF EXISTS "Moderators can update chat messages" ON public.chat_messages;

CREATE POLICY "Authors and moderators can update chat messages"
  ON public.chat_messages FOR UPDATE
  USING (
    auth.uid() = member_id
    OR EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND cmr.community_id = chat_messages.community_id
        AND r.code IN ('admin', 'moderator')
    )
  );

-- Fix member_restrictions SELECT policy: only moderators + self
DROP POLICY IF EXISTS "Restrictions are publicly readable" ON public.member_restrictions;

CREATE POLICY "Restrictions readable by moderators and self"
  ON public.member_restrictions FOR SELECT
  USING (
    auth.uid() = member_id
    OR EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND cmr.community_id = member_restrictions.community_id
        AND r.code IN ('admin', 'moderator')
    )
  );
