'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatDate } from '@arena/shared';
import type { FeedArticle } from '@arena/shared';
import { FeedLikeButton } from './FeedLikeButton';
import { Avatar } from '@/components/ui/Avatar';
import { useSupabase } from '@/hooks/useSupabase';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';

interface FeedArticleCardProps {
  article: FeedArticle;
  communitySlug: string;
  userId: string | null;
  canModerate?: boolean;
}

export function FeedArticleCard({ article, communitySlug, userId, canModerate }: FeedArticleCardProps) {
  const t = useTranslations('tribune');
  const supabase = useSupabase();
  const [removed, setRemoved] = useState(false);

  const isOwn = !!(userId && article.author.id === userId);
  const canRemove = isOwn || !!canModerate;

  // Hide the promo from the chat feed only — the article stays published in
  // the press gallery (gallery queries don't filter hidden_from_feed).
  async function handleRemoveFromFeed() {
    await supabase
      .from('articles')
      .update({ hidden_from_feed: true } as never)
      .eq('id', article.id);
    setRemoved(true);
  }

  if (removed) return null;

  return (
    <div className="px-4 py-3">
      <Link
        href={`/tribunes/${communitySlug}/articles/${article.slug}`}
        className="block max-w-md overflow-hidden rounded-xl bg-gray-950 shadow-sm transition hover:opacity-95"
      >
        {/* Cover banner */}
        {article.coverImageUrl && (
          <div className="relative h-40 w-full">
            <Image
              src={article.coverImageUrl}
              alt={article.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 448px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/40 to-transparent" />
            <span className="absolute left-3 top-3 rounded-full bg-brand-blue/20 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-blue-light">
              {t('article')}
            </span>
          </div>
        )}

        <div className="p-4">
          {/* Badge shown inline when there's no cover to overlay it on */}
          {!article.coverImageUrl && (
            <span className="mb-2 inline-block rounded-full bg-brand-blue/20 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-blue-light">
              {t('article')}
            </span>
          )}

          {/* Title */}
          <h3 className="text-base font-bold text-white line-clamp-2">{article.title}</h3>

          {/* Excerpt */}
          {article.excerpt && (
            <p className="mt-1 text-sm text-gray-400 line-clamp-2">{article.excerpt}</p>
          )}

          {/* Author + stats */}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar url={article.author.avatarUrl} name={article.author.username} size="xs" />
              <span className="text-xs font-medium text-gray-300">{article.author.username}</span>
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>{formatDate(article.publishedAt)}</span>
              {article.viewCount > 0 && (
                <span className="flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {article.viewCount}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>

      {/* Actions: like (not own) + remove from feed */}
      <div className="mt-1 flex items-center gap-1 pl-1">
        {!isOwn && (
          <FeedLikeButton
            targetType="article"
            targetId={article.id}
            initialLikeCount={article.likeCount}
            userId={userId}
          />
        )}
        {isOwn && article.likeCount > 0 && (
          <span className="px-2 py-1 text-xs text-gray-300">{article.likeCount} ♥</span>
        )}
        {canRemove && (
          <button
            onClick={handleRemoveFromFeed}
            className="ml-auto rounded-full px-2 py-1 text-xs text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400"
          >
            {t('removeFromChat')}
          </button>
        )}
      </div>
    </div>
  );
}
