'use client';

import { memo } from 'react';
import { Heart, ThumbsDown, Flame } from 'lucide-react';

// At/above this many replies, the flame turns red to flag a "hot" thread.
const HOT_THREAD_REPLIES = 5;

interface FeedMessageStatsProps {
  likeCount: number;
  dislikeCount: number;
  replyCount: number;
  /** When provided, the reply count becomes a button that opens the thread. */
  onOpenThread?: () => void;
}

export const FeedMessageStats = memo(function FeedMessageStats({
  likeCount,
  dislikeCount,
  replyCount,
  onOpenThread,
}: FeedMessageStatsProps) {
  if (likeCount === 0 && dislikeCount === 0 && replyCount === 0) return null;

  // Orange by default, red once the thread is hot. One-shot pop on hover.
  const flameClass = `h-4 w-4 group-hover:animate-[flame-pop_0.4s_ease-out] ${
    replyCount >= HOT_THREAD_REPLIES ? 'text-red-600' : 'text-orange-500'
  }`;
  const flameStat = (
    <>
      <Flame className={flameClass} fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
      <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{replyCount}</span>
    </>
  );

  return (
    <div className="mt-1 flex items-center gap-2.5 text-xs">
      {likeCount > 0 && (
        <span className="flex items-center gap-1 text-red-500">
          <Heart className="h-4 w-4" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
          <span className="font-semibold tabular-nums">{likeCount}</span>
        </span>
      )}
      {dislikeCount > 0 && (
        <span className="flex items-center gap-1 text-orange-500">
          <ThumbsDown className="h-4 w-4" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
          <span className="font-semibold tabular-nums">{dislikeCount}</span>
        </span>
      )}
      {replyCount > 0 &&
        (onOpenThread ? (
          <button type="button" onClick={onOpenThread} className="flex items-center gap-1 rounded" title="Rejoindre la discussion">
            {flameStat}
            <span className="ml-0.5 text-[11px] font-medium text-orange-500 group-hover:underline">
              Rejoins la discussion
            </span>
          </button>
        ) : (
          <span className="flex items-center gap-1">{flameStat}</span>
        ))}
    </div>
  );
});
