import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@arena/supabase-client';
import { ORIGINAL_CONTENT_CUTOFF } from '@arena/shared';
import { translatedField } from '@/lib/contentTranslation';
import { cleanArticleTitle, decodeEntities } from '@/lib/articleText';

export interface PressGalleryItem {
  type: 'article' | 'podcast';
  id: number;
  title: string;
  slug?: string;
  excerpt: string | null;
  description: string | null;
  coverImageUrl: string | null;
  coverPositionY: number;
  likeCount: number;
  viewCount: number;
  durationSeconds: number | null;
  publishedAt: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  communityId: number;
  // French name (fallback). UI must call displayCommunityName({name, name_en}, locale)
  // before showing this — never render communityName directly on locale-aware surfaces.
  communityName: string;
  communityNameEn: string | null;
  communitySlug: string;
  communityLogoUrl: string | null;
  isLive: boolean;
  youtubeVideoId: string | null;
}

export interface ArticleComment {
  id: number;
  articleId: number;
  memberId: string;
  content: string;
  createdAt: string;
  username: string;
  avatarUrl: string | null;
  parentId: number | null;
  replyCount: number;
  isRemoved: boolean;
}

interface FetchOptions {
  filter: 'all' | 'articles' | 'podcasts';
  communityId?: number;
  // Restrict to a set of communities (used by the /sport/[category]
  // hubs, which span every tribune in a sport). Takes precedence over
  // communityId when both are given.
  communityIds?: number[];
  excludeCommunityId?: number;
  sort: 'latest' | 'trending';
  // Offset-based pagination. The whole window [0, offset+limit] is
  // re-fetched and re-sorted each call, so pagination is consistent
  // regardless of sort mode — unlike the old date-cursor, which broke
  // for trending and dropped items in the mixed feed.
  offset?: number;
  limit: number;
  // Article ids to exclude (the "featured" articles already shown in
  // the hero). Articles only — podcasts are a separate id space.
  excludeArticleIds?: number[];
  // Viewer locale — selects the translated title/excerpt when the piece
  // was written in another language.
  locale: string;
}

export interface FetchResult {
  items: PressGalleryItem[];
  hasMore: boolean;
}

// Unified engagement score — the single definition of "trending",
// applied identically whether the feed is articles, podcasts or mixed.
function trendingScore(item: PressGalleryItem): number {
  return item.viewCount + item.likeCount * 3;
}

// Deterministic order so re-fetching the same window never reshuffles
// tied items (which would dup/skip rows at a page boundary).
function tieBreak(a: PressGalleryItem, b: PressGalleryItem): number {
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  return b.id - a.id;
}

function compareItems(a: PressGalleryItem, b: PressGalleryItem, sort: 'latest' | 'trending'): number {
  if (sort === 'trending') {
    const s = trendingScore(b) - trendingScore(a);
    return s !== 0 ? s : tieBreak(a, b);
  }
  const d = new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  return d !== 0 ? d : tieBreak(a, b);
}

// How deep the trending feed can be paged. The trending pool is sorted
// client-side by trendingScore; 96 items (8 pages of 12) is far more
// than anyone scrolls into a "trending" list.
const TRENDING_POOL = 96;

const ARTICLE_SELECT = 'id, title, slug, excerpt, source_lang, title_translated, excerpt_translated, cover_image_url, cover_position_y, like_count, view_count, published_at, author_name_override, author_id, communities!inner(id, name, name_en, slug, logo_url), members:members!articles_author_id_fkey(username, first_name, last_name, avatar_url, creator_display_name, creator_avatar_url)';
const PODCAST_SELECT = 'id, title, description, source_lang, title_translated, description_translated, cover_image_url, like_count, duration_seconds, created_at, youtube_video_id, is_live, published_by, communities!inner(id, name, name_en, slug, logo_url), members:members!podcasts_published_by_fkey(username, avatar_url, creator_display_name, creator_avatar_url)';

export async function fetchFeaturedItems(
  supabase: SupabaseClient<Database>,
  locale: string,
): Promise<PressGalleryItem[]> {
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  // Strict chronological order: the three featured slots are simply the
  // three most recently published articles from the last 48h that have a
  // cover image. Hero = newest, secondaries = next two by date. Engagement
  // doesn't factor in — readers on a news site expect the front page to
  // reflect when stories were published, not how popular they later become.
  const { data } = await supabase
    .from('articles')
    .select(ARTICLE_SELECT)
    .eq('is_published', true)
    .eq('is_removed', false)
    .not('cover_image_url', 'is', null)
    .gte('published_at', twoDaysAgo)
    .gte('published_at', ORIGINAL_CONTENT_CUTOFF)
    .order('published_at', { ascending: false })
    .limit(3);

  if (data && data.length > 0) {
    return (data as unknown as ArticleRow[]).map((r) => articleToItem(r, locale));
  }

  // Fallback when nothing was published in the last 48h: surface the
  // most recent 3 original articles with cover images regardless of age,
  // so the hero slot is never empty on a quiet day.
  const { data: fallback } = await supabase
    .from('articles')
    .select(ARTICLE_SELECT)
    .eq('is_published', true)
    .eq('is_removed', false)
    .not('cover_image_url', 'is', null)
    .gte('published_at', ORIGINAL_CONTENT_CUTOFF)
    .order('published_at', { ascending: false })
    .limit(3);

  if (!fallback || fallback.length === 0) return [];
  return fallback.map((r) => articleToItem(r as unknown as ArticleRow, locale));
}

export async function fetchPressGalleryItems(
  supabase: SupabaseClient<Database>,
  options: FetchOptions,
): Promise<FetchResult> {
  const { filter, communityId, communityIds, excludeCommunityId, sort, limit, excludeArticleIds, locale } = options;
  const offset = options.offset ?? 0;

  // We re-fetch the whole window from row 0 and slice — so pagination
  // is correct for every sort mode. `need` is one past the requested
  // window so we can tell whether a further page exists. Trending is
  // re-ranked client-side, so it needs a fixed pool to rank within.
  const need = offset + limit + 1;
  const poolSize = sort === 'trending' ? Math.max(need, TRENDING_POOL) : need;

  const pool = { communityId, communityIds, excludeCommunityId, sort, poolSize, locale };

  const [articles, podcasts] = await Promise.all([
    filter === 'podcasts'
      ? Promise.resolve([] as PressGalleryItem[])
      : fetchArticles(supabase, { ...pool, excludeArticleIds }),
    filter === 'articles'
      ? Promise.resolve([] as PressGalleryItem[])
      : fetchPodcasts(supabase, pool),
  ]);

  const merged = [...articles, ...podcasts].sort((a, b) => compareItems(a, b, sort));
  const items = merged.slice(offset, offset + limit);
  return { items, hasMore: merged.length > offset + limit };
}

// --- Internal fetch helpers ---

interface InternalFetchOptions {
  communityId?: number;
  communityIds?: number[];
  excludeCommunityId?: number;
  sort: 'latest' | 'trending';
  poolSize: number;
  excludeArticleIds?: number[];
  locale: string;
}

async function fetchArticles(
  supabase: SupabaseClient<Database>,
  options: InternalFetchOptions,
): Promise<PressGalleryItem[]> {
  const { communityId, communityIds, excludeCommunityId, sort, poolSize, excludeArticleIds, locale } = options;

  // Articles imported from the legacy Zone Nordiques archive (published
  // before ORIGINAL_CONTENT_CUTOFF) are noindex and excluded from every
  // public listing. They remain reachable by direct URL for legacy links
  // but never appear in the home gallery, hub feeds, or category lists —
  // otherwise the AdSense reviewer follows internal links into thin /
  // duplicate pages and rejects the site for "low value content".
  let q = supabase
    .from('articles')
    .select(ARTICLE_SELECT)
    .eq('is_published', true)
    .eq('is_removed', false)
    .gte('published_at', ORIGINAL_CONTENT_CUTOFF);

  if (communityIds && communityIds.length > 0) q = q.in('community_id', communityIds);
  else if (communityId) q = q.eq('community_id', communityId);
  if (excludeCommunityId) q = q.neq('community_id', excludeCommunityId);
  if (excludeArticleIds && excludeArticleIds.length > 0) {
    q = q.not('id', 'in', `(${excludeArticleIds.join(',')})`);
  }

  // Trending fetches a pool ordered by view_count as a proxy; the final
  // ranking by trendingScore happens client-side after the merge. `id`
  // is a stable secondary key so the pool boundary is deterministic.
  if (sort === 'trending') {
    q = q.order('view_count', { ascending: false }).order('id', { ascending: false });
  } else {
    q = q.order('published_at', { ascending: false }).order('id', { ascending: false });
  }

  const { data } = await q.limit(poolSize);
  if (!data) return [];
  return data.map((r) => articleToItem(r as unknown as ArticleRow, locale));
}

async function fetchPodcasts(
  supabase: SupabaseClient<Database>,
  options: InternalFetchOptions,
): Promise<PressGalleryItem[]> {
  const { communityId, communityIds, excludeCommunityId, sort, poolSize, locale } = options;

  let q = supabase
    .from('podcasts')
    .select(PODCAST_SELECT)
    .eq('is_published', true)
    .or('is_removed.eq.false,is_removed.is.null');

  if (communityIds && communityIds.length > 0) q = q.in('community_id', communityIds);
  else if (communityId) q = q.eq('community_id', communityId);
  if (excludeCommunityId) q = q.neq('community_id', excludeCommunityId);

  if (sort === 'trending') {
    q = q.order('like_count', { ascending: false }).order('id', { ascending: false });
  } else {
    q = q.order('created_at', { ascending: false }).order('id', { ascending: false });
  }

  const { data } = await q.limit(poolSize);
  if (!data) return [];
  return data.map((r) => podcastToItem(r as unknown as PodcastRow, locale));
}

// --- Comments ---

type CommentRow = {
  id: number;
  article_id: number;
  member_id: string;
  content: string;
  created_at: string;
  parent_id: number | null;
  reply_count: number;
  is_removed: boolean;
  members: { username: string; avatar_url: string | null } | null;
};

function rowToComment(r: CommentRow): ArticleComment {
  return {
    id: r.id,
    articleId: r.article_id,
    memberId: r.member_id,
    content: r.content,
    createdAt: r.created_at,
    username: r.members?.username ?? 'Inconnu',
    avatarUrl: r.members?.avatar_url ?? null,
    parentId: r.parent_id,
    replyCount: r.reply_count,
    isRemoved: r.is_removed,
  };
}

/** Fetch top-level comments for an article (no replies). */
export async function fetchArticleComments(
  supabase: SupabaseClient<Database>,
  articleId: number,
): Promise<ArticleComment[]> {
  const { data } = await supabase
    .from('article_comments')
    .select('id, article_id, member_id, content, created_at, parent_id, reply_count, is_removed, members:members!article_comments_member_id_fkey(username, avatar_url)')
    .eq('article_id', articleId)
    .is('parent_id', null)
    .eq('is_removed', false)
    .order('created_at', { ascending: true })
    .limit(100);

  if (!data) return [];
  return (data as unknown as CommentRow[]).map(rowToComment);
}

/** Fetch the replies to a specific comment. */
export async function fetchCommentReplies(
  supabase: SupabaseClient<Database>,
  parentCommentId: number,
): Promise<ArticleComment[]> {
  const { data } = await supabase
    .from('article_comments')
    .select('id, article_id, member_id, content, created_at, parent_id, reply_count, is_removed, members:members!article_comments_member_id_fkey(username, avatar_url)')
    .eq('parent_id', parentCommentId)
    .eq('is_removed', false)
    .order('created_at', { ascending: true })
    .limit(200);

  if (!data) return [];
  return (data as unknown as CommentRow[]).map(rowToComment);
}

/** Create a top-level comment OR a reply to another comment. */
export async function createArticleComment(
  supabase: SupabaseClient<Database>,
  articleId: number,
  memberId: string,
  content: string,
  parentId?: number | null,
): Promise<{ error: Error | null; id?: number }> {
  const trimmed = content.trim();
  if (!trimmed || trimmed.length > 2000) return { error: new Error('Invalid comment') };

  const { data, error } = await supabase
    .from('article_comments')
    .insert({
      article_id: articleId,
      member_id: memberId,
      content: trimmed,
      parent_id: parentId ?? null,
    })
    .select('id')
    .single();

  if (error) return { error: new Error(error.message) };
  return { error: null, id: (data as { id: number } | null)?.id };
}

/**
 * Soft-delete a comment. Works for :
 *   - the comment's author (RLS "Users can update own comments")
 *   - a community admin / moderator / owner (RLS "Moderators can moderate
 *     comments in their community", added in migration 00049)
 * RLS enforces the permission check; we just set is_removed + removed_by.
 */
export async function removeArticleComment(
  supabase: SupabaseClient<Database>,
  commentId: number,
  actingMemberId: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('article_comments')
    .update({
      is_removed: true,
      removed_at: new Date().toISOString(),
      removed_by: actingMemberId,
    })
    .eq('id', commentId);

  return { error: error ? new Error(error.message) : null };
}

// --- Row types & converters ---

interface ArticleRow {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  source_lang: string | null;
  title_translated: string | null;
  excerpt_translated: string | null;
  cover_image_url: string | null;
  cover_position_y: number | null;
  like_count: number;
  view_count: number;
  published_at: string | null;
  author_name_override: string | null;
  author_id: string;
  communities: { id: number; name: string; name_en: string | null; slug: string; logo_url: string | null };
  members: { username: string; first_name: string | null; last_name: string | null; avatar_url: string | null; creator_display_name: string | null; creator_avatar_url: string | null } | null;
}

interface PodcastRow {
  id: number;
  title: string;
  description: string | null;
  source_lang: string | null;
  title_translated: string | null;
  description_translated: string | null;
  cover_image_url: string | null;
  like_count: number;
  duration_seconds: number | null;
  created_at: string;
  youtube_video_id: string | null;
  is_live: boolean;
  published_by: string;
  communities: { id: number; name: string; name_en: string | null; slug: string; logo_url: string | null };
  members: { username: string; avatar_url: string | null; creator_display_name: string | null; creator_avatar_url: string | null } | null;
}

function articleToItem(r: ArticleRow, locale: string): PressGalleryItem {
  const m = r.members;
  return {
    type: 'article',
    id: r.id,
    title: cleanArticleTitle(translatedField(r.source_lang, locale, r.title, r.title_translated), null, 'Article'),
    slug: r.slug,
    excerpt: decodeEntities(translatedField(r.source_lang, locale, r.excerpt, r.excerpt_translated)) || null,
    description: null,
    coverImageUrl: r.cover_image_url,
    coverPositionY: r.cover_position_y ?? 50,
    likeCount: r.like_count,
    viewCount: r.view_count,
    durationSeconds: null,
    publishedAt: r.published_at ?? new Date().toISOString(),
    authorId: r.author_id,
    authorName: r.author_name_override || (m?.first_name && m?.last_name ? `${m.first_name} ${m.last_name}` : null) || m?.username || 'Inconnu',
    authorAvatarUrl: r.author_name_override ? null : (m?.avatar_url || null),
    communityId: r.communities.id,
    communityName: r.communities.name,
    communityNameEn: r.communities.name_en,
    communitySlug: r.communities.slug,
    communityLogoUrl: r.communities.logo_url,
    isLive: false,
    youtubeVideoId: null,
  };
}

function podcastToItem(r: PodcastRow, locale: string): PressGalleryItem {
  const m = r.members;
  return {
    type: 'podcast',
    id: r.id,
    title: translatedField(r.source_lang, locale, r.title, r.title_translated),
    slug: undefined,
    excerpt: null,
    description: translatedField(r.source_lang, locale, r.description, r.description_translated),
    coverImageUrl: r.cover_image_url,
    coverPositionY: 50,
    likeCount: r.like_count,
    viewCount: 0,
    durationSeconds: r.duration_seconds,
    publishedAt: r.created_at,
    authorId: r.published_by,
    authorName: m?.username || 'Inconnu',
    authorAvatarUrl: m?.avatar_url || null,
    communityId: r.communities.id,
    communityName: r.communities.name,
    communityNameEn: r.communities.name_en,
    communitySlug: r.communities.slug,
    communityLogoUrl: r.communities.logo_url,
    isLive: r.is_live ?? false,
    youtubeVideoId: r.youtube_video_id,
  };
}
