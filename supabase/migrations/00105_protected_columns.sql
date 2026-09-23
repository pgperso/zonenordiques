-- Security hardening round 3 (adversarial audit 2026-09). Apply in the Supabase
-- SQL editor AFTER the code from the same commit is deployed (the article page
-- now records views via the service role, so the REVOKE at the end is safe).
--
-- ROOT CAUSE FIXED HERE: several UPDATE policies had no WITH CHECK and no
-- column restriction, so a user could PATCH ANY column of their own rows via
-- PostgREST (community hop, un-moderation, counter inflation, future
-- published_at, notification re-fan-out). INSERT policies had the same gap
-- (pool_entries: unlimited trades / phantom confirmed team).
--
-- Approach: BEFORE INSERT/UPDATE "protected columns" triggers that apply ONLY
-- to DIRECT client writes (PostgREST roles anon/authenticated at trigger depth
-- 1). Nested trigger cascades (counter bumps), SECURITY DEFINER RPCs
-- (current_user = owner) and the service_role are exempt automatically, so no
-- legitimate server-side write is affected. Global owners are exempt.

-- ─────────────────────────────────────────────────────────────────────────
-- Helpers
CREATE OR REPLACE FUNCTION public.is_direct_client_write()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT current_user IN ('anon', 'authenticated') AND pg_trigger_depth() = 1;
$$;

-- Owner (global) OR admin/moderator of the given community.
CREATE OR REPLACE FUNCTION public.is_community_moderator(p_community_id INT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_member_roles cmr
    JOIN public.roles r ON r.id = cmr.role_id
    WHERE cmr.member_id = auth.uid()
      AND ((cmr.community_id = p_community_id AND r.code IN ('admin', 'moderator')) OR r.code = 'owner')
  );
$$;

-- Shared removal rule: a non-moderator may only self-remove (removed_by = self)
-- and may only un-remove something THEY removed. Raises otherwise.
CREATE OR REPLACE FUNCTION public.check_removal_change(
  p_old_removed BOOLEAN, p_new_removed BOOLEAN,
  p_old_removed_by UUID, p_new_removed_by UUID,
  p_community_id INT
) RETURNS void LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF public.is_community_moderator(p_community_id) THEN RETURN; END IF;
  IF p_new_removed = false AND p_old_removed = true AND p_old_removed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Seul un modérateur peut annuler cette suppression';
  END IF;
  IF p_new_removed = true AND p_new_removed_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'removed_by doit être vous-même';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 1) ARTICLES (ÉLEVÉE — E-02)
CREATE OR REPLACE FUNCTION public.articles_protect_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.is_direct_client_write() OR public.is_global_owner() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.like_count := 0;
    NEW.view_count := 0;
    NEW.is_removed := false; NEW.removed_at := NULL; NEW.removed_by := NULL;
    NEW.published_notified_at := NULL;
    NEW.translated_at := NULL; NEW.title_translated := NULL;
    NEW.excerpt_translated := NULL; NEW.body_translated := NULL;
    IF NEW.published_at IS NOT NULL AND NEW.published_at > now() + interval '5 minutes' THEN
      RAISE EXCEPTION 'published_at ne peut pas être dans le futur';
    END IF;
    RETURN NEW;
  END IF;

  -- Hard-protected on UPDATE
  IF NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.author_id IS DISTINCT FROM OLD.author_id
     OR NEW.like_count IS DISTINCT FROM OLD.like_count
     OR NEW.view_count IS DISTINCT FROM OLD.view_count
     OR NEW.published_notified_at IS DISTINCT FROM OLD.published_notified_at
     OR NEW.translated_at IS DISTINCT FROM OLD.translated_at
     OR NEW.title_translated IS DISTINCT FROM OLD.title_translated
     OR NEW.excerpt_translated IS DISTINCT FROM OLD.excerpt_translated
     OR NEW.body_translated IS DISTINCT FROM OLD.body_translated
     OR NEW.is_ai_generated IS DISTINCT FROM OLD.is_ai_generated
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Champ protégé';
  END IF;

  -- published_at: set once (first publish), never in the future.
  IF NEW.published_at IS DISTINCT FROM OLD.published_at THEN
    IF OLD.published_at IS NOT NULL THEN
      RAISE EXCEPTION 'published_at est figé après la première publication';
    END IF;
    IF NEW.published_at > now() + interval '5 minutes' THEN
      RAISE EXCEPTION 'published_at ne peut pas être dans le futur';
    END IF;
  END IF;

  IF NEW.is_removed IS DISTINCT FROM OLD.is_removed
     OR NEW.removed_by IS DISTINCT FROM OLD.removed_by
     OR NEW.removed_at IS DISTINCT FROM OLD.removed_at THEN
    PERFORM public.check_removal_change(OLD.is_removed, NEW.is_removed, OLD.removed_by, NEW.removed_by, OLD.community_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_articles_protect ON public.articles;
CREATE TRIGGER trg_articles_protect
  BEFORE INSERT OR UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.articles_protect_columns();

-- ─────────────────────────────────────────────────────────────────────────
-- 2) CHAT_MESSAGES (MOYENNE — M-02: mute bypass via community hop, un-moderation)
CREATE OR REPLACE FUNCTION public.chat_messages_protect_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.is_direct_client_write() OR public.is_global_owner() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.like_count := 0; NEW.dislike_count := 0; NEW.smiley_count := 0;
    NEW.surprise_count := 0; NEW.reply_count := 0; NEW.repost_count := 0;
    NEW.last_reply_username := NULL;
    NEW.is_removed := false; NEW.removed_at := NULL; NEW.removed_by := NULL;
    RETURN NEW;
  END IF;

  IF NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.member_id IS DISTINCT FROM OLD.member_id
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR NEW.repost_of_id IS DISTINCT FROM OLD.repost_of_id
     OR NEW.quote_of_id IS DISTINCT FROM OLD.quote_of_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.like_count IS DISTINCT FROM OLD.like_count
     OR NEW.dislike_count IS DISTINCT FROM OLD.dislike_count
     OR NEW.smiley_count IS DISTINCT FROM OLD.smiley_count
     OR NEW.surprise_count IS DISTINCT FROM OLD.surprise_count
     OR NEW.reply_count IS DISTINCT FROM OLD.reply_count
     OR NEW.repost_count IS DISTINCT FROM OLD.repost_count
     OR NEW.last_reply_username IS DISTINCT FROM OLD.last_reply_username THEN
    RAISE EXCEPTION 'Champ protégé';
  END IF;

  IF NEW.is_removed IS DISTINCT FROM OLD.is_removed
     OR NEW.removed_by IS DISTINCT FROM OLD.removed_by
     OR NEW.removed_at IS DISTINCT FROM OLD.removed_at THEN
    PERFORM public.check_removal_change(OLD.is_removed, NEW.is_removed, OLD.removed_by, NEW.removed_by, OLD.community_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_chat_messages_protect ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_protect
  BEFORE INSERT OR UPDATE ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_protect_columns();

-- ─────────────────────────────────────────────────────────────────────────
-- 3) ARTICLE_COMMENTS (MOYENNE — M-03)
CREATE OR REPLACE FUNCTION public.article_comments_protect_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_community INT;
BEGIN
  IF NOT public.is_direct_client_write() OR public.is_global_owner() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.reply_count := 0;
    NEW.is_removed := false; NEW.removed_at := NULL; NEW.removed_by := NULL;
    RETURN NEW;
  END IF;

  IF NEW.article_id IS DISTINCT FROM OLD.article_id
     OR NEW.member_id IS DISTINCT FROM OLD.member_id
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.reply_count IS DISTINCT FROM OLD.reply_count THEN
    RAISE EXCEPTION 'Champ protégé';
  END IF;

  IF NEW.is_removed IS DISTINCT FROM OLD.is_removed
     OR NEW.removed_by IS DISTINCT FROM OLD.removed_by
     OR NEW.removed_at IS DISTINCT FROM OLD.removed_at THEN
    SELECT community_id INTO v_community FROM public.articles WHERE id = OLD.article_id;
    PERFORM public.check_removal_change(OLD.is_removed, NEW.is_removed, OLD.removed_by, NEW.removed_by, v_community);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_article_comments_protect ON public.article_comments;
CREATE TRIGGER trg_article_comments_protect
  BEFORE INSERT OR UPDATE ON public.article_comments
  FOR EACH ROW EXECUTE FUNCTION public.article_comments_protect_columns();

-- ─────────────────────────────────────────────────────────────────────────
-- 4) PODCASTS (FAIBLE — F-02: completes 00104's WITH CHECK)
CREATE OR REPLACE FUNCTION public.podcasts_protect_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.is_direct_client_write() OR public.is_global_owner() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.like_count := 0;
    NEW.is_removed := false; NEW.removed_at := NULL; NEW.removed_by := NULL;
    RETURN NEW;
  END IF;

  IF NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.published_by IS DISTINCT FROM OLD.published_by
     OR NEW.like_count IS DISTINCT FROM OLD.like_count
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Champ protégé';
  END IF;

  IF NEW.is_removed IS DISTINCT FROM OLD.is_removed
     OR NEW.removed_by IS DISTINCT FROM OLD.removed_by
     OR NEW.removed_at IS DISTINCT FROM OLD.removed_at THEN
    PERFORM public.check_removal_change(OLD.is_removed, NEW.is_removed, OLD.removed_by, NEW.removed_by, OLD.community_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_podcasts_protect ON public.podcasts;
CREATE TRIGGER trg_podcasts_protect
  BEFORE INSERT OR UPDATE ON public.podcasts
  FOR EACH ROW EXECUTE FUNCTION public.podcasts_protect_columns();

-- ─────────────────────────────────────────────────────────────────────────
-- 5) MEMBERS (FAIBLE — F-01: rank/verified inflation + username case-hijack)
CREATE OR REPLACE FUNCTION public.members_protect_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Username case-collision guard applies to EVERY writer (incl. signup trigger):
  -- login resolves lower(username), so "Admin" vs "admin" would hijack login.
  IF (TG_OP = 'INSERT' OR NEW.username IS DISTINCT FROM OLD.username) AND NEW.username IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.members m
      WHERE lower(m.username) = lower(NEW.username) AND m.id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'Ce nom d''utilisateur est déjà pris';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND public.is_direct_client_write() AND NOT public.is_global_owner() THEN
    IF NEW.message_count IS DISTINCT FROM OLD.message_count
       OR NEW.is_verified IS DISTINCT FROM OLD.is_verified
       OR NEW.legacy_member_id IS DISTINCT FROM OLD.legacy_member_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Champ protégé';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_members_protect ON public.members;
CREATE TRIGGER trg_members_protect
  BEFORE INSERT OR UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.members_protect_columns();

-- ─────────────────────────────────────────────────────────────────────────
-- 6) POOL_ENTRIES INSERT (ÉLEVÉE — E-01): the existing guard is BEFORE UPDATE
-- only. Force defaults on client INSERT so the sensitive fields can only be
-- set through the privileged pool RPCs.
CREATE OR REPLACE FUNCTION public.pool_entry_insert_guard()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.pool_is_privileged() THEN
    NEW.spent_cents := 0;
    NEW.is_locked := false;
    NEW.locked_at := NULL;
    NEW.transactions_used := 0;
    NEW.is_confirmed := false;
    NEW.confirmed_at := NULL;
    NEW.team_pick := NULL;
    NEW.star_forward_id := NULL;
    NEW.star_defense_id := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pool_entry_insert_guard ON public.pool_entries;
CREATE TRIGGER trg_pool_entry_insert_guard
  BEFORE INSERT ON public.pool_entries
  FOR EACH ROW EXECUTE FUNCTION public.pool_entry_insert_guard();

-- ─────────────────────────────────────────────────────────────────────────
-- 7) METER (M-05 partial): the meter is append-only — members must not delete
-- and re-cast votes. Owner-only DELETE (00101) stays.
DROP POLICY IF EXISTS "Users can delete own votes" ON public.nordiquometre_votes;
DROP POLICY IF EXISTS "Users can delete own votes" ON public.exposmetre_votes;

-- ─────────────────────────────────────────────────────────────────────────
-- 8) VIEW COUNTER (M-04): record_article_view was callable by anon with a
-- client-supplied hash (unbounded view inflation). The article page now calls
-- it with the service role and a server-derived IP hash, so revoke client access.
REVOKE EXECUTE ON FUNCTION public.record_article_view(INT, TEXT) FROM PUBLIC, anon, authenticated;
