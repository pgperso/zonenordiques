import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@arena/supabase-client';
import { articleSchema } from '@arena/shared';
import { cleanArticleTitle, decodeEntities } from '@/lib/articleText';
import { announceArticle, cleanupArticleBotMessages } from './botService';
import { BRAND } from '@/lib/brand';

/**
 * Poke the translation worker so freshly published or edited content is
 * translated within seconds rather than waiting for the daily cron.
 * Fire-and-forget — the worker is idempotent and the cron is the safety net.
 */
function triggerTranslation(): void {
  if (typeof window === 'undefined') return;
  void fetch('/api/translate-pending', { method: 'POST' }).catch(() => {});
}

export async function removeArticle(
  supabase: SupabaseClient<Database>,
  articleId: number,
  userId: string,
) {
  // Fetch slug before removing so we can clean up bot messages
  const { data: article } = await supabase
    .from('articles')
    .select('slug')
    .eq('id', articleId)
    .single();

  // Suffix slug to free it for reuse (unique constraint: community_id + slug)
  const freedSlug = article
    ? `${(article as { slug: string }).slug}-deleted-${Date.now()}`
    : undefined;

  const result = await supabase
    .from('articles')
    .update({
      is_removed: true,
      removed_at: new Date().toISOString(),
      removed_by: userId,
      ...(freedSlug ? { slug: freedSlug } : {}),
    } as never)
    .eq('id', articleId);

  // Clean up bot announcement messages (fire-and-forget)
  if (article) {
    void cleanupArticleBotMessages(supabase, (article as { slug: string }).slug);
  }

  return result;
}

export async function createArticle(
  supabase: SupabaseClient<Database>,
  data: {
    communityId: number;
    authorId: string;
    title: string;
    slug: string;
    excerpt: string | null;
    body: string;
    coverImageUrl: string | null;
    coverPositionY?: number;
    isPublished?: boolean;
    authorNameOverride?: string | null;
    isAiGenerated?: boolean;
  },
) {
  const validated = articleSchema.parse({
    title: data.title,
    body: data.body,
    slug: data.slug,
    excerpt: data.excerpt,
    coverImageUrl: data.coverImageUrl,
  });

  const result = await supabase.from('articles').insert({
    community_id: data.communityId,
    author_id: data.authorId,
    title: cleanArticleTitle(validated.title, validated.body, 'Article'),
    slug: validated.slug,
    excerpt: decodeEntities(validated.excerpt) || null,
    body: validated.body,
    cover_image_url: validated.coverImageUrl ?? null,
    cover_position_y: Math.round(data.coverPositionY ?? 50),
    is_published: data.isPublished ?? true,
    published_at: data.isPublished !== false ? new Date().toISOString() : null,
    author_name_override: data.authorNameOverride?.trim() || null,
    is_ai_generated: data.isAiGenerated ?? false,
  } as never);

  // Bot announcement when published (fire-and-forget)
  if (!result.error && data.isPublished !== false) {
    const authorName = data.authorNameOverride?.trim();
    const [{ data: author }, { data: community }] = await Promise.all([
      authorName ? Promise.resolve({ data: null }) : supabase.from('members').select('username, first_name, last_name').eq('id', data.authorId).single(),
      supabase.from('communities').select('name, slug').eq('id', data.communityId).single(),
    ]);
    const a = author as { username: string; first_name: string | null; last_name: string | null } | null;
    const displayName = authorName
      || (a?.first_name && a?.last_name ? `${a.first_name} ${a.last_name}` : null)
      || a?.username
      || 'Inconnu';
    if (community) {
      const communitySlug = (community as { slug: string }).slug;
      const articleUrl = `${BRAND.url}/fr/tribunes/${communitySlug}/articles/${validated.slug}`;
      announceArticle(supabase, data.communityId, displayName, (community as { name: string }).name, validated.title, articleUrl);
    }
  }

  if (!result.error) triggerTranslation();
  return result;
}

export async function updateArticle(
  supabase: SupabaseClient<Database>,
  articleId: number,
  data: {
    title: string;
    slug: string;
    excerpt: string | null;
    body: string;
    coverImageUrl: string | null;
    coverPositionY?: number;
    isPublished?: boolean;
    authorNameOverride?: string | null;
    communityId?: number;
    isAiGenerated?: boolean;
  },
) {
  const validated = articleSchema.parse({
    title: data.title,
    body: data.body,
    slug: data.slug,
    excerpt: data.excerpt,
    coverImageUrl: data.coverImageUrl,
  });

  const update: Record<string, unknown> = {
    title: validated.title,
    slug: validated.slug,
    excerpt: validated.excerpt ?? null,
    body: validated.body,
    cover_image_url: validated.coverImageUrl ?? null,
    cover_position_y: Math.round(data.coverPositionY ?? 50),
    author_name_override: data.authorNameOverride?.trim() || null,
    ...(data.communityId ? { community_id: data.communityId } : {}),
    ...(data.isAiGenerated !== undefined ? { is_ai_generated: data.isAiGenerated } : {}),
    updated_at: new Date().toISOString(),
  };

  if (data.isPublished !== undefined) {
    update.is_published = data.isPublished;
    if (data.isPublished) {
      update.published_at = new Date().toISOString();
    }
  }

  const result = await supabase.from('articles').update(update as never).eq('id', articleId);
  if (!result.error) triggerTranslation();
  return result;
}

export async function fetchArticle(
  supabase: SupabaseClient<Database>,
  articleId: number,
) {
  return supabase
    .from('articles')
    .select('id, community_id, author_id, title, slug, excerpt, body, cover_image_url, cover_position_y, like_count, view_count, published_at, is_published, is_removed, created_at, updated_at, author_name_override')
    .eq('id', articleId)
    .single();
}

export async function fetchArticlesByAuthor(
  supabase: SupabaseClient<Database>,
  authorId: string,
  communityId?: number,
) {
  let query = supabase
    .from('articles')
    .select('id, title, slug, excerpt, cover_image_url, cover_position_y, is_published, published_at, created_at, updated_at, like_count, view_count, is_removed, author_name_override, community_id, communities!inner(name, slug)')
    .eq('author_id', authorId)
    .eq('is_removed', false)
    .order('created_at', { ascending: false })
    .limit(100);

  if (communityId) {
    query = query.eq('community_id', communityId);
  }

  return query;
}
