'use client';

import { memo, useCallback } from 'react';
import { useLike } from '@/hooks/useLike';
import { useBatchLikeStatus } from '@/hooks/useBatchLikeStatus';

interface FeedLikeButtonProps {
  targetType: 'message' | 'article' | 'podcast';
  targetId: number;
  initialLikeCount: number;
  userId: string | null;
}

export const FeedLikeButton = memo(function FeedLikeButton({
  targetType,
  targetId,
  initialLikeCount,
  userId,
}: FeedLikeButtonProps) {
  const batchCtx = useBatchLikeStatus();
  const batchIsLiked = batchCtx?.isLiked(targetType, targetId);

  const { isLiked, likeCount, toggleLike: rawToggle, loading } = useLike(
    targetType,
    targetId,
    initialLikeCount,
    userId,
    batchIsLiked,
  );

  const toggleLike = useCallback(async () => {
    await rawToggle();
    // Sync back to batch context for consistency
    batchCtx?.setLiked(targetType, targetId, !isLiked);
  }, [rawToggle, batchCtx, targetType, targetId, isLiked]);

  return (
    <button
      onClick={toggleLike}
      disabled={!userId || loading}
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-medium transition ${
        isLiked
          ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-950'
          : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600'
      } disabled:cursor-not-allowed disabled:opacity-50`}
      title={isLiked ? 'Retirer le like' : 'Liker'}
    >
      <svg
        className="h-5 w-5"
        fill={isLiked ? 'currentColor' : 'none'}
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
        />
      </svg>
      {likeCount > 0 && <span className="tabular-nums">{likeCount}</span>}
    </button>
  );
});
