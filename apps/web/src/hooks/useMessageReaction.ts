'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSupabase } from './useSupabase';
import { useBatchLikeStatus } from './useBatchLikeStatus';

type Reaction = 'like' | 'dislike' | 'smiley';

const TABLE: Record<Reaction, 'message_likes' | 'message_dislikes' | 'message_smileys'> = {
  like: 'message_likes',
  dislike: 'message_dislikes',
  smiley: 'message_smileys',
};

export interface UseMessageReactionReturn {
  isLiked: boolean;
  isDisliked: boolean;
  isSmiley: boolean;
  likeCount: number;
  dislikeCount: number;
  smileyCount: number;
  toggleLike: () => Promise<void>;
  toggleDislike: () => Promise<void>;
  toggleSmiley: () => Promise<void>;
  loading: boolean;
}

export function useMessageReaction(
  messageId: number,
  initialLikeCount: number,
  initialDislikeCount: number,
  initialSmileyCount: number,
  userId: string | null,
): UseMessageReactionReturn {
  const supabase = useSupabase();
  const batchCtx = useBatchLikeStatus();
  const batchLiked = batchCtx?.isLiked('message', messageId);
  const batchDisliked = batchCtx?.isDisliked(messageId);
  const batchSmiley = batchCtx?.isSmileyed(messageId);

  const [isLiked, setIsLiked] = useState(batchLiked ?? false);
  const [isDisliked, setIsDisliked] = useState(batchDisliked ?? false);
  const [isSmiley, setIsSmiley] = useState(batchSmiley ?? false);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [dislikeCount, setDislikeCount] = useState(initialDislikeCount);
  const [smileyCount, setSmileyCount] = useState(initialSmileyCount);
  const [loading, setLoading] = useState(false);

  // Sync per-user reaction state from the batch context.
  useEffect(() => {
    if (batchLiked !== undefined) setIsLiked(batchLiked);
  }, [batchLiked]);
  useEffect(() => {
    if (batchDisliked !== undefined) setIsDisliked(batchDisliked);
  }, [batchDisliked]);
  useEffect(() => {
    if (batchSmiley !== undefined) setIsSmiley(batchSmiley);
  }, [batchSmiley]);

  // Sync counts from parent (Realtime updates).
  useEffect(() => setLikeCount(initialLikeCount), [initialLikeCount]);
  useEffect(() => setDislikeCount(initialDislikeCount), [initialDislikeCount]);
  useEffect(() => setSmileyCount(initialSmileyCount), [initialSmileyCount]);

  // A message holds at most one reaction. `apply` toggles the target reaction:
  // clicking the active one clears it, clicking another switches to it (removing
  // whichever was set). One DB delete for the previous reaction + one insert for
  // the new one, mirrored optimistically and via the batch context.
  const apply = useCallback(
    async (next: Reaction) => {
      if (!userId || loading) return;
      setLoading(true);

      const prev: Reaction | null = isLiked ? 'like' : isDisliked ? 'dislike' : isSmiley ? 'smiley' : null;
      const removing = prev === next;

      const setFlag: Record<Reaction, (v: boolean) => void> = {
        like: setIsLiked,
        dislike: setIsDisliked,
        smiley: setIsSmiley,
      };
      const bumpCount: Record<Reaction, (d: number) => void> = {
        like: (d) => setLikeCount((c) => Math.max(0, c + d)),
        dislike: (d) => setDislikeCount((c) => Math.max(0, c + d)),
        smiley: (d) => setSmileyCount((c) => Math.max(0, c + d)),
      };

      // Optimistic: clear the previous reaction, then set the new one (unless
      // we're just removing the one that was already active).
      if (prev) { setFlag[prev](false); bumpCount[prev](-1); }
      if (!removing) { setFlag[next](true); bumpCount[next](1); }

      try {
        if (prev) {
          await supabase.from(TABLE[prev]).delete().eq('message_id', messageId).eq('member_id', userId);
        }
        if (!removing) {
          await supabase.from(TABLE[next]).insert({ message_id: messageId, member_id: userId });
        }
        // Reflect the single active reaction in the batch context.
        batchCtx?.setLiked('message', messageId, !removing && next === 'like');
        batchCtx?.setDisliked(messageId, !removing && next === 'dislike');
        batchCtx?.setSmileyed(messageId, !removing && next === 'smiley');
      } catch {
        // Roll back to the server-provided baseline on failure.
        setIsLiked(batchLiked ?? false);
        setIsDisliked(batchDisliked ?? false);
        setIsSmiley(batchSmiley ?? false);
        setLikeCount(initialLikeCount);
        setDislikeCount(initialDislikeCount);
        setSmileyCount(initialSmileyCount);
      }
      setLoading(false);
    },
    [
      userId, loading, isLiked, isDisliked, isSmiley, messageId,
      initialLikeCount, initialDislikeCount, initialSmileyCount,
      batchLiked, batchDisliked, batchSmiley, batchCtx, supabase,
    ],
  );

  const toggleLike = useCallback(() => apply('like'), [apply]);
  const toggleDislike = useCallback(() => apply('dislike'), [apply]);
  const toggleSmiley = useCallback(() => apply('smiley'), [apply]);

  return {
    isLiked, isDisliked, isSmiley,
    likeCount, dislikeCount, smileyCount,
    toggleLike, toggleDislike, toggleSmiley,
    loading,
  };
}
