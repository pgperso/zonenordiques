-- Security hardening round 5 (adversarial audit 2026-09, F-12). Apply in the
-- Supabase SQL editor AFTER the code from the same commit is deployed: link
-- previews are now generated and written server-side (/api/chat/link-previews,
-- service role), so the client no longer needs to write `link_previews`.
--
-- Before: the client fetched /api/link-preview and then PATCHed
-- chat_messages.link_previews directly — so a member could forge a preview card
-- (any title / image / url) on their own message, a visual-phishing vector that
-- bypassed the preview endpoint entirely.
--
-- Extends the 00105 trigger: `link_previews` joins the hard-protected list for
-- direct client writes. The service role (server route) stays exempt.
CREATE OR REPLACE FUNCTION public.chat_messages_protect_columns()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT public.is_direct_client_write() OR public.is_global_owner() THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.like_count := 0; NEW.dislike_count := 0; NEW.smiley_count := 0;
    NEW.surprise_count := 0; NEW.reply_count := 0; NEW.repost_count := 0;
    NEW.last_reply_username := NULL;
    NEW.is_removed := false; NEW.removed_at := NULL; NEW.removed_by := NULL;
    -- Previews are attached server-side after the message exists.
    NEW.link_previews := NULL;
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
     OR NEW.last_reply_username IS DISTINCT FROM OLD.last_reply_username
     OR NEW.link_previews IS DISTINCT FROM OLD.link_previews THEN
    RAISE EXCEPTION 'Champ protégé';
  END IF;

  IF NEW.is_removed IS DISTINCT FROM OLD.is_removed
     OR NEW.removed_by IS DISTINCT FROM OLD.removed_by
     OR NEW.removed_at IS DISTINCT FROM OLD.removed_at THEN
    PERFORM public.check_removal_change(OLD.is_removed, NEW.is_removed, OLD.removed_by, NEW.removed_by, OLD.community_id);
  END IF;
  RETURN NEW;
END $$;
