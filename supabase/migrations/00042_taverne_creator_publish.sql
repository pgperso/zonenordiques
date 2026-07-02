-- Allow creators (Journaliste role) to publish articles, not just admin/moderator
DROP POLICY IF EXISTS "Privileged members can insert articles" ON public.articles;
CREATE POLICY "Privileged members can insert articles"
  ON public.articles FOR INSERT
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.community_id = articles.community_id
        AND cmr.member_id = auth.uid()
        AND r.code IN ('admin', 'moderator', 'creator')
    )
  );
