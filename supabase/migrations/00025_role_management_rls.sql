-- Allow owners (global) to manage roles in community_member_roles
-- Previously only admins (per-community) could manage roles

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can insert roles" ON public.community_member_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.community_member_roles;

-- Recreate with owner support: admin in same community OR owner in any community
CREATE POLICY "Admins and owners can insert roles"
  ON public.community_member_roles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_member_roles cmr2
      JOIN public.roles r ON r.id = cmr2.role_id
      WHERE cmr2.member_id = auth.uid()
        AND (
          (cmr2.community_id = community_member_roles.community_id AND r.code IN ('admin'))
          OR r.code = 'owner'
        )
    )
  );

CREATE POLICY "Admins and owners can delete roles"
  ON public.community_member_roles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.community_member_roles cmr2
      JOIN public.roles r ON r.id = cmr2.role_id
      WHERE cmr2.member_id = auth.uid()
        AND (
          (cmr2.community_id = community_member_roles.community_id AND r.code IN ('admin'))
          OR r.code = 'owner'
        )
    )
  );
