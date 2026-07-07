-- ============================================================
-- 00087: Give the 'owner' role moderation powers in RLS
--
-- The 'owner' role was only seeded today (00085) — it postdates the
-- moderation RLS policies, which listed just ('admin','moderator'). So a
-- pure owner (QcFan) had canModerate=true in the UI (isOwner shortcut) but
-- the DB rejected the actual writes: deleting another member's chat message
-- silently reverted on refresh, muting members and moderating articles
-- failed too.
--
-- Fix: widen each policy to also accept owner, following the pattern already
-- used in 00027 (owner is GLOBAL — no community match — while admin/moderator
-- stay scoped to the community).
-- ============================================================

-- chat_messages: authors + moderators can update (soft-delete lives here)
DROP POLICY IF EXISTS "Authors and moderators can update chat messages" ON public.chat_messages;
CREATE POLICY "Authors and moderators can update chat messages"
  ON public.chat_messages FOR UPDATE
  USING (
    auth.uid() = member_id
    OR EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND (
          (cmr.community_id = chat_messages.community_id AND r.code IN ('admin', 'moderator'))
          OR r.code = 'owner'
        )
    )
  );

-- member_restrictions: read
DROP POLICY IF EXISTS "Restrictions readable by moderators and self" ON public.member_restrictions;
CREATE POLICY "Restrictions readable by moderators and self"
  ON public.member_restrictions FOR SELECT
  USING (
    auth.uid() = member_id
    OR EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND (
          (cmr.community_id = member_restrictions.community_id AND r.code IN ('admin', 'moderator'))
          OR r.code = 'owner'
        )
    )
  );

-- member_restrictions: insert (mute/ban)
DROP POLICY IF EXISTS "Moderators can insert restrictions" ON public.member_restrictions;
CREATE POLICY "Moderators can insert restrictions"
  ON public.member_restrictions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND (
          (cmr.community_id = member_restrictions.community_id AND r.code IN ('admin', 'moderator'))
          OR r.code = 'owner'
        )
    )
  );

-- member_restrictions: delete (unmute)
DROP POLICY IF EXISTS "Moderators can delete restrictions" ON public.member_restrictions;
CREATE POLICY "Moderators can delete restrictions"
  ON public.member_restrictions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND (
          (cmr.community_id = member_restrictions.community_id AND r.code IN ('admin', 'moderator'))
          OR r.code = 'owner'
        )
    )
  );

-- articles: moderators can update any article
DROP POLICY IF EXISTS "Moderators can update any article" ON public.articles;
CREATE POLICY "Moderators can update any article"
  ON public.articles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND (
          (cmr.community_id = articles.community_id AND r.code IN ('admin', 'moderator'))
          OR r.code = 'owner'
        )
    )
  );

-- articles: privileged members can insert (admin/moderator/creator + owner)
DROP POLICY IF EXISTS "Privileged members can insert articles" ON public.articles;
CREATE POLICY "Privileged members can insert articles"
  ON public.articles FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND (
          (cmr.community_id = articles.community_id AND r.code IN ('admin', 'moderator', 'creator'))
          OR r.code = 'owner'
        )
    )
  );
