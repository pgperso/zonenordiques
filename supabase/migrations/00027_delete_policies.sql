-- DELETE policies for podcasts and articles
-- Authors can delete their own content, moderators/owners can delete any

CREATE POLICY "Authors and moderators can delete podcasts"
  ON public.podcasts FOR DELETE
  USING (
    auth.uid() = published_by
    OR EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND (
          (cmr.community_id = podcasts.community_id AND r.code IN ('admin', 'moderator'))
          OR r.code = 'owner'
        )
    )
  );

CREATE POLICY "Authors and moderators can delete articles"
  ON public.articles FOR DELETE
  USING (
    auth.uid() = author_id
    OR EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND (
          (cmr.community_id = articles.community_id AND r.code IN ('admin', 'moderator'))
          OR r.code = 'owner'
        )
    )
  );
