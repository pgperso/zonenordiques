'use client';

import { memo } from 'react';
import { Flame } from 'lucide-react';

// At/above this many replies, the flame turns red to flag a "hot" thread.
const HOT_THREAD_REPLIES = 5;

interface FeedMessageStatsProps {
  likeCount: number;
  dislikeCount: number;
  smileyCount: number;
  replyCount: number;
  /** When provided, the reply count becomes a button that opens the thread. */
  onOpenThread?: () => void;
}

export const FeedMessageStats = memo(function FeedMessageStats({
  likeCount,
  dislikeCount,
  smileyCount,
  replyCount,
  onOpenThread,
}: FeedMessageStatsProps) {
  if (likeCount === 0 && dislikeCount === 0 && smileyCount === 0 && replyCount === 0) return null;

  // Only the flame carries colour — orange by default, red once the thread is
  // hot. One-shot flame pop on hover. The count label stays a neutral tone.
  const hot = replyCount >= HOT_THREAD_REPLIES;
  const flameColor = hot ? 'text-red-600' : 'text-orange-500';
  const flameIcon = (
    <Flame className={`h-4 w-4 group-hover:animate-[flame-pop_0.4s_ease-out] ${flameColor}`} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
  );
  const replyLabel = `${replyCount} ${replyCount > 1 ? 'réponses' : 'réponse'}`;

  return (
    <div className="mt-1 flex items-center gap-2.5 text-xs">
      {likeCount > 0 && (
        <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
          <span className="text-[13px] leading-none" aria-hidden="true">❤️</span>
          <span className="font-semibold tabular-nums">{likeCount}</span>
        </span>
      )}
      {smileyCount > 0 && (
        <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
          <span className="text-[13px] leading-none" aria-hidden="true">😆</span>
          <span className="font-semibold tabular-nums">{smileyCount}</span>
        </span>
      )}
      {dislikeCount > 0 && (
        <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
          <span className="text-[13px] leading-none" aria-hidden="true">😡</span>
          <span className="font-semibold tabular-nums">{dislikeCount}</span>
        </span>
      )}
      {replyCount > 0 &&
        (onOpenThread ? (
          <button type="button" onClick={onOpenThread} className="flex items-center gap-1.5 rounded" title="Rejoindre la discussion">
            {flameIcon}
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{replyLabel}</span>
          </button>
        ) : (
          <span className="flex items-center gap-1.5">
            {flameIcon}
            <span className="font-semibold tabular-nums text-gray-500 dark:text-gray-400">{replyLabel}</span>
          </span>
        ))}
    </div>
  );
});
