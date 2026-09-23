-- Security hardening round 2 (re-audit 2026-09). Apply in the Supabase SQL editor.
-- Fixes gaps the re-audit found in migrations 00102/00103.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) HIGH — 00103's REVOKE was ineffective. Postgres functions get a DEFAULT
-- EXECUTE grant to PUBLIC; anon/authenticated are members of PUBLIC, so they
-- kept EXECUTE and email harvesting was still possible. Revoke from PUBLIC too.
REVOKE EXECUTE ON FUNCTION public.get_email_from_username(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_email_from_username(TEXT) FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2) MEDIUM — send_bot_message: a community membership check still let any
-- member post arbitrary "official bot" content in their own tribunes (everyone
-- is auto-joined to la-taverne). Gate to content-creator roles instead, matching
-- articles/podcasts. Server-side callers (auth.uid() IS NULL) still no-op.
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

  -- Only creator/admin/moderator in the target community, or a global owner,
  -- may trigger a bot message.
  IF NOT EXISTS (
    SELECT 1 FROM public.community_member_roles cmr
    JOIN public.roles r ON r.id = cmr.role_id
    WHERE cmr.member_id = auth.uid()
      AND (
        (cmr.community_id = p_community_id AND r.code IN ('admin', 'moderator', 'creator'))
        OR r.code = 'owner'
      )
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.chat_messages (community_id, member_id, content)
  VALUES (p_community_id, '00000000-0000-0000-0000-000000000001', p_content);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_bot_message(INT, TEXT) FROM PUBLIC, anon;

-- ─────────────────────────────────────────────────────────────────────────
-- 3) LOW/MEDIUM — podcasts UPDATE had USING but no WITH CHECK, so an author
-- could re-assign published_by, un-remove a moderated podcast, or move it to
-- another community. Constrain the post-update row.
DROP POLICY IF EXISTS "Authors can update their own podcasts" ON public.podcasts;

CREATE POLICY "Authors can update their own podcasts"
  ON public.podcasts FOR UPDATE
  USING (auth.uid() = published_by)
  WITH CHECK (auth.uid() = published_by);

-- ─────────────────────────────────────────────────────────────────────────
-- 4) LOW — two SECURITY DEFINER functions were missing a pinned search_path
-- (search-path-resolution hardening, flagged by Supabase's advisor). ALTER
-- instead of recreating, so their bodies are untouched (no signup/view breakage).
ALTER FUNCTION public.increment_article_views(INT) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
