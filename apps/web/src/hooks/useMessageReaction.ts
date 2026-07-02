'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSupabase } from './useSupabase';
import { useBatchLikeStatus } from './useBatchLikeStatus';

export interface UseMessageReactionReturn {
  isLiked: boolean;
  isDisliked: boolean;
  likeCount: number;
  dislikeCount: number;
  toggleLike: () => Promise<void>;
  toggleDislike: () => Promise<void>;
  loading: boolean;
}

export function useMessageReaction(
  messageId: number,
  initialLikeCount: number,
  initialDislikeCount: number,
  userId: string | null,
): UseMessageReactionReturn {
  const supabase = useSupabase();
  const batchCtx = useBatchLikeStatus();
  const batchLiked = batchCtx?.isLiked('message', messageId);
  const batchDisliked = batchCtx?.isDisliked(messageId);

  const [isLiked, setIsLiked] = useState(batchLiked ?? false);
  const [isDisliked, setIsDisliked] = useState(batchDisliked ?? false);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [dislikeCount, setDislikeCount] = useState(initialDislikeCount);
  const [loading, setLoading] = useState(false);

  // Sync from batch context
  useEffect(() => {
    if (batchLiked !== undefined) setIsLiked(batchLiked);
  }, [batchLiked]);
  useEffect(() => {
    if (batchDisliked !== undefined) setIsDisliked(batchDisliked);
  }, [batchDisliked]);

  // Sync counts from parent (Realtime updates)
  useEffect(() => setLikeCount(initialLikeCount), [initialLikeCount]);
  useEffect(() => setDislikeCount(initialDislikeCount), [initialDislikeCount]);

  const toggleLike = useCallback(async () => {
    if (!userId || loading) return;
    setLoading(true);

    const wasLiked = isLiked;
    const wasDisliked = isDisliked;

    // Optimistic update
    if (wasLiked) {
      setIsLiked(false);
      setLikeCount((c) => c - 1);
    } else {
      setIsLiked(true);
      setLikeCount((c) => c + 1);
      if (wasDisliked) {
        setIsDisliked(false);
        setDislikeCount((c) => Math.max(0, c - 1));
      }
    }

    try {
      if (wasLiked) {
        await supabase.from('message_likes').delete().eq('message_id', messageId).eq('member_id', userId);
      } else {
        if (wasDisliked) {
          await supabase.from('message_dislikes').delete().eq('message_id', messageId).eq('member_id', userId);
          batchCtx?.setDisliked(messageId, false);
        }
        await supabase.from('message_likes').insert({ message_id: messageId, member_id: userId });
      }
      batchCtx?.setLiked('message', messageId, !wasLiked);
    } catch {
      setIsLiked(wasLiked);
      setIsDisliked(wasDisliked);
      setLikeCount(initialLikeCount);
      setDislikeCount(initialDislikeCount);
    }
    setLoading(false);
  }, [userId, loading, isLiked, isDisliked, messageId, initialLikeCount, initialDislikeCount, batchCtx, supabase]);

  const toggleDislike = useCallback(async () => {
    if (!userId || loading) return;
    setLoading(true);

    const wasLiked = isLiked;
    const wasDisliked = isDisliked;

    // Optimistic update
    if (wasDisliked) {
      setIsDisliked(false);
      setDislikeCount((c) => c - 1);
    } else {
      setIsDisliked(true);
      setDislikeCount((c) => c + 1);
      if (wasLiked) {
        setIsLiked(false);
        setLikeCount((c) => Math.max(0, c - 1));
      }
    }

    try {
      if (wasDisliked) {
        await supabase.from('message_dislikes').delete().eq('message_id', messageId).eq('member_id', userId);
      } else {
        if (wasLiked) {
          await supabase.from('message_likes').delete().eq('message_id', messageId).eq('member_id', userId);
          batchCtx?.setLiked('message', messageId, false);
        }
        await supabase.from('message_dislikes').insert({ message_id: messageId, member_id: userId });
      }
      batchCtx?.setDisliked(messageId, !wasDisliked);
    } catch {
      setIsLiked(wasLiked);
      setIsDisliked(wasDisliked);
      setLikeCount(initialLikeCount);
      setDislikeCount(initialDislikeCount);
    }
    setLoading(false);
  }, [userId, loading, isLiked, isDisliked, messageId, initialLikeCount, initialDislikeCount, batchCtx, supabase]);

  return { isLiked, isDisliked, likeCount, dislikeCount, toggleLike, toggleDislike, loading };
}
