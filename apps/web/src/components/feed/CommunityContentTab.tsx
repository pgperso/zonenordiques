'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useSupabase } from '@/hooks/useSupabase';
import { cleanArticleTitle, decodeEntities } from '@/lib/articleText';
import { formatTime, formatDuration } from '@arena/shared';
import { Avatar } from '@/components/ui/Avatar';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { AdSlot } from '@/components/ads/AdSlot';
import { removePodcast } from '@/services/podcastService';
import { Trash2, EyeOff } from 'lucide-react';
import { getContentAuthor } from '@/lib/contentAuthors';
import { BRAND } from '@/lib/brand';

const CONTENT_AD_INTERVAL = 8; // Ad every 8 items (avoid excessive ad density)

interface ContentItem {
  type: 'article' | 'podcast';
  id: number;
  title: string;
  slug?: string;
  excerpt?: string | null;
  description?: string | null;
  coverImageUrl: string | null;
  likeCount: number;
  viewCount?: number;
  durationSeconds?: number | null;
  publishedAt: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  isLive?: boolean;
  youtubeVideoId?: string | null;
}

interface CommunityContentTabProps {
  communityId: number;
  communitySlug: string;
  userId: string | null;
  canModerate: boolean;
}

type FilterType = 'all' | 'articles' | 'podcasts';

export function CommunityContentTab({ communityId, communitySlug, userId, canModerate }: CommunityContentTabProps) {
  const t = useTranslations('content');
  const tt = useTranslations('tribune');
  const tc = useTranslations('common');
  const supabase = useSupabase();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      const [{ data: articles }, { data: podcasts }] = await Promise.all([
        supabase
          .from('articles')
          .select('id, author_id, title, slug, excerpt, cover_image_url, like_count, view_count, published_at, author_name_override, members:members!articles_author_id_fkey(username, avatar_url, creator_display_name, creator_avatar_url)')
          .eq('community_id', communityId)
          .eq('is_published', true)
          .eq('is_removed', false)
          .eq('hidden_from_feed', false)
          .order('published_at', { ascending: false })
          .limit(50),
        supabase
          .from('podcasts')
          .select('id, published_by, title, description, cover_image_url, like_count, duration_seconds, created_at, members:members!podcasts_published_by_fkey(username, avatar_url, creator_display_name, creator_avatar_url)')
          .eq('community_id', communityId)
          .eq('is_published', true)
          .or('is_removed.eq.false,is_removed.is.null')
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (cancelled) return;

      const mapped: ContentItem[] = [];

      for (const a of (articles ?? []) as unknown as { id: number; author_id: string; title: string; slug: string; excerpt: string | null; cover_image_url: string | null; like_count: number; view_count: number; published_at: string; author_name_override: string | null; members: { username: string; avatar_url: string | null; creator_display_name: string | null; creator_avatar_url: string | null } | null }[]) {
        mapped.push({
          type: 'article',
          id: a.id,
          title: cleanArticleTitle(a.title, null, 'Article'),
          slug: a.slug,
          excerpt: decodeEntities(a.excerpt) || null,
          coverImageUrl: a.cover_image_url,
          likeCount: a.like_count,
          viewCount: a.view_count,
          publishedAt: a.published_at,
          authorId: a.author_id,
          authorName: a.author_name_override || a.members?.creator_display_name || a.members?.username || 'Inconnu',
          authorAvatarUrl: a.author_name_override ? null : (a.members?.creator_avatar_url || a.members?.avatar_url || null),
        });
      }

      for (const p of (podcasts ?? []) as { id: number; published_by: string | null; title: string; description: string | null; cover_image_url: string | null; like_count: number; duration_seconds: number | null; created_at: string; members: { username: string; avatar_url: string | null; creator_display_name: string | null; creator_avatar_url: string | null } | null }[]) {
        mapped.push({
          type: 'podcast',
          id: p.id,
          title: p.title,
          description: p.description,
          coverImageUrl: p.cover_image_url,
          likeCount: p.like_count,
          durationSeconds: p.duration_seconds,
          publishedAt: p.created_at,
          authorId: p.published_by ?? '',
          authorName: p.members?.creator_display_name || p.members?.username || 'Inconnu',
          authorAvatarUrl: p.members?.creator_avatar_url || p.members?.avatar_url || null,
        });
      }

      mapped.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
      setItems(mapped);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [supabase, communityId]);

  const filtered = filter === 'all' ? items : items.filter((i) => i.type === (filter === 'articles' ? 'article' : 'podcast'));

  return (
    <div className="flex h-full flex-col">
      {/* Filter tabs */}
      <div className="flex shrink-0 gap-1 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
        {(['all', 'articles', 'podcasts'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === f
                ? 'bg-brand-blue text-white'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-700 dark:hover:text-gray-300 dark:text-gray-300'
            }`}
          >
            {f === 'all' ? t('all') : f === 'articles' ? t('articles') : t('podcasts')}
          </button>
        ))}
      </div>

      {/* Content list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3 p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-[#1e1e1e]" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <svg className="mb-2 h-10 w-10" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
            </svg>
            <p className="text-sm">{t('noContent')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map((item, idx) => (
              <div key={`${item.type}-${item.id}`}>
              {idx > 0 && idx % CONTENT_AD_INTERVAL === 0 && (
                <div className="border-y border-gray-100 bg-gray-50 dark:bg-[#1e1e1e] px-4 py-3">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-gray-400">{tt('sponsored')}</p>
                  <AdSlot slotId={`content-feed-${idx}`} format="in-feed" layoutKey="-gw-3+1f-3d+2z" className="w-full" />
                </div>
              )}
              <ContentRow
                item={item}
                communitySlug={communitySlug}
                userId={userId}
                canModerate={canModerate}
                supabase={supabase}
                onRemoved={(id, type) => setItems((prev) => prev.filter((i) => !(i.id === id && i.type === type)))}
              />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Content row with action buttons ---

function ContentRow({
  item,
  communitySlug,
  userId,
  canModerate,
  supabase,
  onRemoved,
}: {
  item: ContentItem;
  communitySlug: string;
  userId: string | null;
  canModerate: boolean;
  supabase: ReturnType<typeof useSupabase>;
  onRemoved: (id: number, type: 'article' | 'podcast') => void;
}) {
  const t = useTranslations('content');
  const tt = useTranslations('tribune');
  const tc = useTranslations('common');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isOwn = userId === item.authorId;
  const canManage = isOwn || canModerate;

  const href = item.type === 'article'
    ? `/tribunes/${communitySlug}/articles/${item.slug}`
    : `/tribunes/${communitySlug}/podcasts/${item.id}`;

  async function handleHideFromFeed() {
    // Articles: hide the promo from the chat but keep it published in the
    // gallery. Podcasts have no such flag, so they fall back to unpublishing.
    if (item.type === 'article') {
      await supabase.from('articles').update({ hidden_from_feed: true } as never).eq('id', item.id);
    } else {
      await supabase.from('podcasts').update({ is_published: false }).eq('id', item.id);
    }
    onRemoved(item.id, item.type);
  }

  async function handleDelete() {
    if (item.type === 'podcast') {
      await removePodcast(supabase, item.id);
    } else {
      await supabase.from('articles').delete().eq('id', item.id);
    }
    onRemoved(item.id, item.type);
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 transition hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-[#1e1e1e]">
      {/* Thumbnail */}
      <Link href={href} className="shrink-0">
        {item.coverImageUrl ? (
          <Image
            src={item.coverImageUrl}
            alt={item.title}
            width={80}
            height={56}
            className="h-14 w-20 rounded-lg object-cover"
          />
        ) : (
          <div className={`flex h-14 w-20 items-center justify-center rounded-lg ${
            item.type === 'article' ? 'bg-purple-100' : 'bg-gray-900'
          }`}>
            {item.type === 'article' ? (
              <svg className="h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            ) : (
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
              </svg>
            )}
          </div>
        )}
      </Link>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            item.type === 'article'
              ? 'bg-purple-100 text-purple-700'
              : 'bg-gray-900 text-gray-300'
          }`}>
            {item.type === 'article' ? tt('article') : tt('podcast')}
          </span>
          <span className="text-[10px] text-gray-400">{formatTime(item.publishedAt)}</span>
          {item.durationSeconds && (
            <span className="text-[10px] text-gray-400">{formatDuration(item.durationSeconds)}</span>
          )}
        </div>
        <Link href={href}>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-1 hover:text-brand-blue">{item.title}</h3>
        </Link>
        <div className="mt-0.5 flex items-center gap-2">
          {(() => {
            const ca = getContentAuthor(item.authorName);
            return ca ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white" style={{ backgroundColor: ca.color }}>{ca.initials}</span>
            ) : (
              <Avatar url={item.authorAvatarUrl} name={item.authorName} size="xs" />
            );
          })()}
          <span className="text-xs text-gray-500 dark:text-gray-400">{item.authorName}</span>
          {item.likeCount > 0 && (
            <span className="text-xs text-gray-400">{item.likeCount} ♥</span>
          )}
          {item.viewCount && item.viewCount > 0 && (
            <span className="text-xs text-gray-400">{t('views', { count: item.viewCount })}</span>
          )}
        </div>
      </div>

      {/* Share + Action buttons */}
      <div className="flex shrink-0 items-center gap-1">
        <a
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(`${BRAND.url}/fr${href}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg p-2 text-gray-400 transition hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600"
          title="Facebook"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        </a>
        <a
          href={`https://x.com/intent/tweet?url=${encodeURIComponent(`${BRAND.url}/fr${href}`)}&text=${encodeURIComponent(item.title)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-900 hover:text-white"
          title="X"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
      </div>
      {canManage && (
        <div className="flex shrink-0 items-center gap-1">
          {confirmDelete ? (
            <span className="flex items-center gap-1.5 text-xs">
              <button onClick={handleDelete} className="font-semibold text-red-500 hover:text-red-700">{tc('confirm')}</button>
              <button onClick={() => setConfirmDelete(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400">{tc('cancel')}</button>
            </span>
          ) : (
            <>
              <button
                onClick={handleHideFromFeed}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400"
                title={t('removeFromFeed')}
              >
                <EyeOff className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-500"
                title={t('deleteForever')}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
