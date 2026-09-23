-- Security hardening round 4 (adversarial audit 2026-09). Apply in the Supabase
-- SQL editor. Requires 00105 (uses public.is_community_moderator).
--
-- Covers: M-10 storage (paths not bound to uploader, article-covers open to any
-- member, podcast-audio DELETE broken), M-07 community:ban ineffective for
-- existing members, M-06 same-day "rear-view" pool trades, F-11 moderators
-- restricting admins/owner, M-05 meter vote race.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) STORAGE — chat-images / chat-audio: path is `<communityId>/<memberId>/…`
-- (segment [2] = uploader, as the existing DELETE policies already assume).
-- Bind INSERT to the caller's own folder and refuse banned members.
DROP POLICY IF EXISTS "Authenticated users can upload chat images" ON storage.objects;
CREATE POLICY "Members upload chat images to their own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-images'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND NOT EXISTS (
      SELECT 1 FROM public.member_restrictions mr
      WHERE mr.community_id::text = (storage.foldername(name))[1]
        AND mr.member_id = auth.uid()
        AND mr.restriction_type = 'community:ban'
        AND (mr.ends_at IS NULL OR mr.ends_at > now())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can upload chat audio" ON storage.objects;
CREATE POLICY "Members upload chat audio to their own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-audio'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND NOT EXISTS (
      SELECT 1 FROM public.member_restrictions mr
      WHERE mr.community_id::text = (storage.foldername(name))[1]
        AND mr.member_id = auth.uid()
        AND mr.restriction_type = 'community:ban'
        AND (mr.ends_at IS NULL OR mr.ends_at > now())
    )
  );

-- article-covers: path is `article-covers/<communityId>/…` (segment [2] =
-- community). Only content creators of that community (or a global owner) may
-- upload or delete — was: any authenticated user, no DELETE at all.
DROP POLICY IF EXISTS "Authenticated users can upload article covers" ON storage.objects;
CREATE POLICY "Content creators can upload article covers"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'article-covers'
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

DROP POLICY IF EXISTS "Content creators can delete article covers" ON storage.objects;
CREATE POLICY "Content creators can delete article covers"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'article-covers'
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

-- podcast-audio: the old UPDATE/DELETE compared segment [2] to auth.uid(), but
-- [2] is the community id → nobody could ever delete (100 MB orphans,
-- removePodcast failing silently). Replace with the same creator gate as the
-- INSERT policy from 00102.
DROP POLICY IF EXISTS "Users can update their own podcast audio" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own podcast audio" ON storage.objects;
CREATE POLICY "Content creators can delete podcast audio"
  ON storage.objects FOR DELETE
  USING (
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
-- 2) COMMUNITY BAN — was only checked when JOINING, so a banned existing member
-- kept posting/commenting. Enforce it on chat and comments, and expel on ban.
DROP POLICY IF EXISTS "Authenticated users can send chat messages (not muted)" ON public.chat_messages;
CREATE POLICY "Authenticated users can send chat messages (not muted or banned)"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    auth.uid() = member_id
    AND NOT EXISTS (
      SELECT 1 FROM public.member_restrictions mr
      WHERE mr.community_id = chat_messages.community_id
        AND mr.member_id = auth.uid()
        AND mr.restriction_type IN ('chat:mute', 'community:ban')
        AND (mr.ends_at IS NULL OR mr.ends_at > now())
    )
  );

DROP POLICY IF EXISTS "Authenticated users can comment" ON public.article_comments;
CREATE POLICY "Authenticated users can comment (not banned)"
  ON public.article_comments FOR INSERT
  WITH CHECK (
    auth.uid() = member_id
    AND NOT EXISTS (
      SELECT 1 FROM public.member_restrictions mr
      JOIN public.articles a ON a.id = article_comments.article_id
      WHERE mr.community_id = a.community_id
        AND mr.member_id = auth.uid()
        AND mr.restriction_type = 'community:ban'
        AND (mr.ends_at IS NULL OR mr.ends_at > now())
    )
  );

-- Expel on ban: remove the membership row so the ban has immediate effect.
CREATE OR REPLACE FUNCTION public.apply_community_ban()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.restriction_type = 'community:ban' THEN
    DELETE FROM public.community_members
    WHERE community_id = NEW.community_id AND member_id = NEW.member_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_community_ban ON public.member_restrictions;
CREATE TRIGGER trg_apply_community_ban
  AFTER INSERT ON public.member_restrictions
  FOR EACH ROW EXECUTE FUNCTION public.apply_community_ban();

-- Let community admins/moderators (and owners) remove a member directly.
DROP POLICY IF EXISTS "Moderators can remove members" ON public.community_members;
CREATE POLICY "Moderators can remove members"
  ON public.community_members FOR DELETE
  USING (public.is_community_moderator(community_id) AND member_id <> auth.uid());

-- ─────────────────────────────────────────────────────────────────────────
-- 3) MODERATION HIERARCHY — a moderator could mute/ban an admin or the owner.
-- The target must not be a global owner, and only an owner may restrict a
-- community admin.
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
    AND NOT EXISTS (
      SELECT 1 FROM public.community_member_roles cmr
      JOIN public.roles r ON r.id = cmr.role_id
      WHERE cmr.member_id = member_restrictions.member_id AND r.code = 'owner'
    )
    AND (
      public.is_global_owner()
      OR NOT EXISTS (
        SELECT 1 FROM public.community_member_roles cmr
        JOIN public.roles r ON r.id = cmr.role_id
        WHERE cmr.member_id = member_restrictions.member_id
          AND cmr.community_id = member_restrictions.community_id
          AND r.code = 'admin'
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 4) POOL — same-day "rear-view" trade: at 22h30 (still "today" in Toronto)
-- a pooler could swap a 0-pt player for tonight's 3-goal scorer and get the
-- already-played game credited. Rule: if any of today's games has already
-- started, the trade takes effect TOMORROW; otherwise (morning trade, before
-- the first puck drop) it still counts for tonight.
CREATE OR REPLACE FUNCTION public.pool_make_transaction(
  p_entry_id BIGINT, p_drop_player BIGINT, p_add_player BIGINT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry     public.pool_entries%ROWTYPE;
  v_season    public.pool_seasons%ROWTYPE;
  v_slot      public.pool_roster_slots%ROWTYPE;
  v_add       public.pool_player_prices%ROWTYPE;
  v_today     DATE;
  v_effective DATE;
  v_spent     BIGINT;
BEGIN
  PERFORM set_config('pool.privileged', '1', true);
  SELECT * INTO v_entry FROM public.pool_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inscription introuvable'; END IF;
  IF v_entry.member_id <> auth.uid() THEN RAISE EXCEPTION 'Non autorisé'; END IF;

  SELECT * INTO v_season FROM public.pool_seasons WHERE id = v_entry.season_id;
  IF NOT v_season.transactions_enabled THEN RAISE EXCEPTION 'Les échanges sont désactivés'; END IF;
  IF v_season.transaction_deadline IS NOT NULL AND NOW() >= v_season.transaction_deadline THEN
    RAISE EXCEPTION 'Date limite des échanges dépassée';
  END IF;
  IF v_entry.transactions_used >= v_season.max_transactions THEN
    RAISE EXCEPTION 'Limite d''échanges atteinte (%/%)', v_entry.transactions_used, v_season.max_transactions;
  END IF;

  v_today := (NOW() AT TIME ZONE v_season.timezone)::date;

  -- Effective date: today unless one of today's games has already started.
  IF EXISTS (
    SELECT 1 FROM public.nhl_games g
    WHERE g.game_date = v_today
      AND (g.start_time_utc <= NOW() OR g.game_state NOT IN ('FUT', 'PRE'))
  ) THEN
    v_effective := v_today + 1;
  ELSE
    v_effective := v_today;
  END IF;

  SELECT * INTO v_slot FROM public.pool_roster_slots
  WHERE entry_id = p_entry_id AND player_id = p_drop_player AND effective_to IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Joueur à retirer absent de l''alignement'; END IF;

  SELECT * INTO v_add FROM public.pool_player_prices
  WHERE season_id = v_entry.season_id AND player_id = p_add_player AND is_draftable;
  IF NOT FOUND THEN RAISE EXCEPTION 'Joueur à ajouter non disponible'; END IF;
  IF v_add.position <> v_slot.slot_position THEN
    RAISE EXCEPTION 'Position incompatible (% vs %)', v_add.position, v_slot.slot_position;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pool_roster_slots
             WHERE entry_id = p_entry_id AND player_id = p_add_player AND effective_to IS NULL) THEN
    RAISE EXCEPTION 'Joueur déjà dans l''alignement';
  END IF;

  UPDATE public.pool_roster_slots SET effective_to = v_effective WHERE id = v_slot.id;
  INSERT INTO public.pool_roster_slots (entry_id, player_id, slot_position, effective_from)
  VALUES (p_entry_id, p_add_player, v_slot.slot_position, v_effective);

  SELECT COALESCE(SUM(price_cents),0) INTO v_spent
  FROM public.pool_roster_slots WHERE entry_id = p_entry_id AND effective_to IS NULL;
  v_spent := v_spent + public.pool_team_price(v_entry.season_id, v_entry.team_pick);
  IF v_spent > v_season.budget_cents THEN
    RAISE EXCEPTION 'Budget dépassé après l''échange (%/% M$)', round(v_spent/1e8,1), round(v_season.budget_cents/1e8,1);
  END IF;

  UPDATE public.pool_entries
     SET spent_cents = v_spent,
         transactions_used = transactions_used + 1,
         star_forward_id = CASE WHEN star_forward_id = p_drop_player THEN NULL ELSE star_forward_id END,
         star_defense_id = CASE WHEN star_defense_id = p_drop_player THEN NULL ELSE star_defense_id END,
         updated_at = NOW()
   WHERE id = p_entry_id;
  INSERT INTO public.pool_transactions (entry_id, dropped_player_id, added_player_id, slot_position)
  VALUES (p_entry_id, p_drop_player, p_add_player, v_slot.slot_position);
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 5) METER — two concurrent casts by the same identity could both pass the
-- daily gate (no unique index since 00098). Serialize per identity with a
-- transaction-scoped advisory lock taken BEFORE the check.
CREATE OR REPLACE FUNCTION public.cast_meter_vote(
  p_meter TEXT,
  p_vote INT,
  p_voter_key TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table  TEXT;
  v_uid    UUID := auth.uid();
  v_owner  BOOLEAN := public.is_global_owner();
  v_exists BOOLEAN;
BEGIN
  IF p_meter NOT IN ('nordiquometre', 'exposmetre') THEN RETURN 'invalid_meter'; END IF;
  IF p_vote IS NULL OR p_vote < 0 OR p_vote > 100 THEN RETURN 'invalid_vote'; END IF;
  v_table := p_meter || '_votes';

  -- Serialize concurrent casts for the same identity (member id or voter key).
  PERFORM pg_advisory_xact_lock(hashtext(p_meter || ':' || COALESCE(v_uid::text, p_voter_key, '')));

  -- Daily gate (owners excepted): one vote per identity per calendar day.
  IF NOT v_owner THEN
    IF v_uid IS NOT NULL THEN
      EXECUTE format(
        'SELECT EXISTS(SELECT 1 FROM public.%I WHERE member_id = $1 AND created_at::date = CURRENT_DATE)',
        v_table
      ) INTO v_exists USING v_uid;
    ELSE
      IF p_voter_key IS NULL OR length(trim(p_voter_key)) < 8 THEN RETURN 'invalid_voter'; END IF;
      EXECUTE format(
        'SELECT EXISTS(SELECT 1 FROM public.%I WHERE voter_key = $1 AND created_at::date = CURRENT_DATE)',
        v_table
      ) INTO v_exists USING p_voter_key;
    END IF;
    IF v_exists THEN RETURN 'already_voted'; END IF;
  END IF;

  EXECUTE format(
    'INSERT INTO public.%I (member_id, voter_key, vote) VALUES ($1, $2, $3)',
    v_table
  ) USING v_uid, CASE WHEN v_uid IS NULL THEN p_voter_key ELSE NULL END, p_vote;

  RETURN 'ok';
END;
$$;
