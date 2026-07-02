'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { formatTime } from '@arena/shared';
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
        className="block max-w-md overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 transition hover:border-gray-300 dark:border-gray-600 hover:shadow-sm"
      >
        {/* Cover image */}
        {article.coverImageUrl && (
          <div className="h-40 w-full bg-gray-100 dark:bg-[#1e1e1e]">
            <Image
              src={article.coverImageUrl}
              alt={article.title}
              width={600}
              height={160}
              className="h-40 w-full object-cover"
              sizes="(max-width: 768px) 100vw, 600px"
            />
          </div>
        )}

        <div className="p-4">
          {/* Article badge */}
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
              {t('article')}
            </span>
            <span className="text-xs text-gray-400">{formatTime(article.publishedAt)}</span>
          </div>

          {/* Title */}
          <h3 className="mb-1 text-base font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
            {article.title}
          </h3>

          {/* Excerpt */}
          {article.excerpt && (
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">{article.excerpt}</p>
          )}

          {/* Author + stats */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Avatar url={article.author.avatarUrl} name={article.author.username} size="xs" />
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{article.author.username}</span>
            </div>

            <div className="flex items-center gap-3 text-xs text-gray-400">
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
