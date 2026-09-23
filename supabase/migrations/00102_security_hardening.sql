-- Security hardening (audit 2026-09). Apply in the Supabase SQL editor.
-- Addresses: (1) admin->global-owner privilege escalation, (2) ungated podcast
-- publishing, (3) TribuneBot impersonation, (4) meter vote stuffing.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) HIGH — community admin could self-grant the GLOBAL 'owner' role.
-- The old INSERT/DELETE policies checked only the granter's role, never which
-- role was being granted. Now: a global owner may manage any role; a community
-- admin may manage only NON-privileged roles (not 'owner', not 'admin') and
-- only within their own community.
DROP POLICY IF EXISTS "Admins and owners can insert roles" ON public.community_member_roles;
DROP POLICY IF EXISTS "Admins and owners can delete roles" ON public.community_member_roles;

CREATE POLICY "Owners manage any role; admins manage non-privileged roles"
  ON public.community_member_roles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid() AND r.code = 'owner'
    )
    OR (
      (SELECT code FROM public.roles WHERE id = community_member_roles.role_id) NOT IN ('owner', 'admin')
      AND EXISTS (
        SELECT 1 FROM public.community_member_roles cmr
        JOIN public.roles r ON r.id = cmr.role_id
        WHERE cmr.member_id = auth.uid()
          AND cmr.community_id = community_member_roles.community_id
          AND r.code = 'admin'
      )
    )
  );

CREATE POLICY "Owners delete any role; admins delete non-privileged roles"
  ON public.community_member_roles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid() AND r.code = 'owner'
    )
    OR (
      (SELECT code FROM public.roles WHERE id = community_member_roles.role_id) NOT IN ('owner', 'admin')
      AND EXISTS (
        SELECT 1 FROM public.community_member_roles cmr
        JOIN public.roles r ON r.id = cmr.role_id
        WHERE cmr.member_id = auth.uid()
          AND cmr.community_id = community_member_roles.community_id
          AND r.code = 'admin'
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 2) MEDIUM — podcast publishing had no role gate (any member could publish +
-- upload audio). Mirror the articles INSERT policy: creator/admin/moderator in
-- the podcast's community, or a global owner.
DROP POLICY IF EXISTS "Authenticated users can create podcasts" ON public.podcasts;

CREATE POLICY "Content creators can create podcasts"
  ON public.podcasts FOR INSERT
  WITH CHECK (
    auth.uid() = published_by
    AND EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND (
          (cmr.community_id = podcasts.community_id AND r.code IN ('admin', 'moderator', 'creator'))
          OR r.code = 'owner'
        )
    )
  );

-- Restrict podcast-audio uploads to content creators too (was: any authenticated
-- user could upload a 100 MB file). Upload path is `podcast-audio/<communityId>/<file>`,
-- so the community id is folder segment [2]. Require a creating role in that
-- community, or a global owner.
DROP POLICY IF EXISTS "Authenticated users can upload podcast audio" ON storage.objects;

CREATE POLICY "Content creators can upload podcast audio"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'podcast-audio'
    AND EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = auth.uid()
        AND (
          (cmr.community_id::text = (storage.foldername(name))[2] AND r.code IN ('admin', 'moderator', 'creator'))
          OR r.code = 'owner'
        )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 3) MEDIUM — any authenticated user could post as the official TribuneBot in
-- ANY community. Require the caller to be a member of the target community;
-- otherwise silently no-op (server-side callers already no-op via auth.uid() IS NULL).
CREATE OR REPLACE FUNCTION public.send_bot_message(
  p_community_id INT,
  p_content TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- Only members of the target community may trigger a bot message there.
  IF NOT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = p_community_id AND member_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.chat_messages (community_id, member_id, content)
  VALUES (p_community_id, '00000000-0000-0000-0000-000000000001', p_content);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 4) LOW — meter vote stuffing. cast_meter_vote() (SECURITY DEFINER) enforces
-- one vote per identity per day, but direct INSERT/UPDATE policies still let a
-- logged-in user write rows straight through PostgREST, bypassing the gate.
-- Drop the direct write policies so all writes go through the RPC. SELECT stays.
DROP POLICY IF EXISTS "Authenticated users can vote" ON public.nordiquometre_votes;
DROP POLICY IF EXISTS "Users can update own vote" ON public.nordiquometre_votes;
DROP POLICY IF EXISTS "Authenticated users can vote" ON public.exposmetre_votes;
DROP POLICY IF EXISTS "Users can update own vote" ON public.exposmetre_votes;
