'use client';

import { memo } from 'react';
import { Heart, ThumbsDown, Flame } from 'lucide-react';

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
          <button
            type="button"
            onClick={onOpenThread}
            className="flex items-center gap-1 rounded text-orange-500 transition hover:text-orange-600"
            title="Voir le fil"
          >
            <Flame className="h-4 w-4" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
            <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{replyCount}</span>
          </button>
        ) : (
          <span className="flex items-center gap-1 text-orange-500">
            <Flame className="h-4 w-4" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
            <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{replyCount}</span>
          </span>
        ))}
    </div>
  );
});
