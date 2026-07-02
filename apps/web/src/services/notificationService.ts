import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@arena/supabase-client';

export type NotificationType =
  | 'comment_reply'
  | 'comment_reply_thread'
  | 'comment_on_article'
  | 'article_published'
  | 'chat_reply'
  | 'mention';

export interface NotificationItem {
  id: number;
  type: NotificationType;
  actorUsername: string | null;
  actorAvatarUrl: string | null;
  /** How many events this (possibly coalesced) notification represents. */
  actorCount: number;
  articleId: number | null;
  articleTitle: string | null;
  articleSlug: string | null;
  communitySlug: string | null;
  communityName: string | null;
  communityNameEn: string | null;
  commentId: number | null;
  isRead: boolean;
  /** Creation or last-coalesce time — the bell sorts and labels by this. */
  updatedAt: string;
}

type RawNotificationRow = {
  id: number;
  type: NotificationType;
  article_id: number | null;
  comment_id: number | null;
  actor_count: number;
  is_read: boolean;
  updated_at: string;
  actor: { username: string; avatar_url: string | null } | null;
  article: {
    title: string;
    slug: string;
    communities: { slug: string } | null;
  } | null;
  community: { slug: string; name: string; name_en: string | null } | null;
};

function rowToNotification(r: RawNotificationRow): NotificationItem {
  return {
    id: r.id,
    type: r.type,
    actorUsername: r.actor?.username ?? null,
    actorAvatarUrl: r.actor?.avatar_url ?? null,
    actorCount: r.actor_count,
    articleId: r.article_id,
    articleTitle: r.article?.title ?? null,
    articleSlug: r.article?.slug ?? null,
    communitySlug: r.community?.slug ?? r.article?.communities?.slug ?? null,
    communityName: r.community?.name ?? null,
    communityNameEn: r.community?.name_en ?? null,
    commentId: r.comment_id,
    isRead: r.is_read,
    updatedAt: r.updated_at,
  };
}

export async function fetchNotifications(
  supabase: SupabaseClient<Database>,
  limit = 20,
): Promise<NotificationItem[]> {
  const { data } = await supabase
    .from('notifications')
    .select(
      'id, type, article_id, comment_id, actor_count, is_read, updated_at, ' +
      'actor:members!notifications_actor_id_fkey(username, avatar_url), ' +
      'article:articles(title, slug, communities!inner(slug)), ' +
      'community:communities!notifications_community_id_fkey(slug, name, name_en)',
    )
    .eq('is_read', false)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (!data) return [];
  return (data as unknown as RawNotificationRow[]).map(rowToNotification);
}

export async function fetchUnreadNotificationCount(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);
  return count ?? 0;
}

export async function markNotificationRead(
  supabase: SupabaseClient<Database>,
  notificationId: number,
): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
}

export async function markAllNotificationsRead(
  supabase: SupabaseClient<Database>,
  recipientId: string,
): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', recipientId)
    .eq('is_read', false);
}

// ── Per-tribune article-notification mutes ───────────────────────────

/** Community ids for which the member has muted article notifications. */
export async function fetchMutedCommunityIds(
  supabase: SupabaseClient<Database>,
  memberId: string,
): Promise<number[]> {
  const { data } = await supabase
    .from('notification_mutes')
    .select('community_id')
    .eq('member_id', memberId);
  return (data ?? []).map((r) => r.community_id);
}

/** Mute (or un-mute) article notifications from a community for a member. */
export async function setArticleNotificationsMuted(
  supabase: SupabaseClient<Database>,
  memberId: string,
  communityId: number,
  muted: boolean,
): Promise<{ error: string | null }> {
  if (muted) {
    const { error } = await supabase
      .from('notification_mutes')
      .upsert({ member_id: memberId, community_id: communityId });
    return { error: error?.message ?? null };
  }
  const { error } = await supabase
    .from('notification_mutes')
    .delete()
    .eq('member_id', memberId)
    .eq('community_id', communityId);
  return { error: error?.message ?? null };
}
