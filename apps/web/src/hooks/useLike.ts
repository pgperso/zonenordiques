'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import type { createClient } from '@/lib/supabase/client';

type LikeTargetType = 'message' | 'article' | 'podcast';

interface UseLikeReturn {
  isLiked: boolean;
  likeCount: number;
  toggleLike: () => Promise<void>;
  loading: boolean;
}

async function checkIfLiked(
  supabase: ReturnType<typeof createClient>,
  targetType: LikeTargetType,
  targetId: number,
  userId: string,
): Promise<boolean> {
  switch (targetType) {
    case 'message': {
      const { data } = await supabase
        .from('message_likes')
        .select('id')
        .eq('message_id', targetId)
        .eq('member_id', userId)
        .maybeSingle();
      return !!data;
    }
    case 'article': {
      const { data } = await supabase
        .from('article_likes')
        .select('id')
        .eq('article_id', targetId)
        .eq('member_id', userId)
        .maybeSingle();
      return !!data;
    }
    case 'podcast': {
      const { data } = await supabase
        .from('podcast_likes')
        .select('id')
        .eq('podcast_id', targetId)
        .eq('member_id', userId)
        .maybeSingle();
      return !!data;
    }
  }
}

async function insertLike(
  supabase: ReturnType<typeof createClient>,
  targetType: LikeTargetType,
  targetId: number,
  userId: string,
): Promise<{ error: unknown }> {
  switch (targetType) {
    case 'message':
      return supabase.from('message_likes').insert({ message_id: targetId, member_id: userId });
    case 'article':
      return supabase.from('article_likes').insert({ article_id: targetId, member_id: userId });
    case 'podcast':
      return supabase.from('podcast_likes').insert({ podcast_id: targetId, member_id: userId });
  }
}

async function deleteLike(
  supabase: ReturnType<typeof createClient>,
  targetType: LikeTargetType,
  targetId: number,
  userId: string,
): Promise<{ error: unknown }> {
  switch (targetType) {
    case 'message':
      return supabase
        .from('message_likes')
        .delete()
        .eq('message_id', targetId)
        .eq('member_id', userId);
    case 'article':
      return supabase
        .from('article_likes')
        .delete()
        .eq('article_id', targetId)
        .eq('member_id', userId);
    case 'podcast':
      return supabase
        .from('podcast_likes')
        .delete()
        .eq('podcast_id', targetId)
        .eq('member_id', userId);
  }
}

export function useLike(
  targetType: LikeTargetType,
  targetId: number,
  initialLikeCount: number,
  userId: string | null,
  batchIsLiked?: boolean,
): UseLikeReturn {
  const [isLiked, setIsLiked] = useState(batchIsLiked ?? false);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [loading, setLoading] = useState(false);
  const supabase = useSupabase();

  // Sync from batch context when it updates
  useEffect(() => {
    if (batchIsLiked !== undefined) setIsLiked(batchIsLiked);
  }, [batchIsLiked]);

  // Fallback: individual check only if batch is not available
  useEffect(() => {
    if (batchIsLiked !== undefined) return;
    if (!userId) return;
    let cancelled = false;

    checkIfLiked(supabase, targetType, targetId, userId).then((liked) => {
      if (!cancelled) setIsLiked(liked);
    });

    return () => { cancelled = true; };
  }, [userId, targetId, targetType, batchIsLiked]);

  // Sync like count from parent prop
  useEffect(() => {
    setLikeCount(initialLikeCount);
  }, [initialLikeCount]);

  const toggleLike = useCallback(async () => {
    if (!userId || loading) return;

    setLoading(true);

    // Optimistic update
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setLikeCount((prev) => prev + (wasLiked ? -1 : 1));

    try {
      if (wasLiked) {
        const { error } = await deleteLike(supabase, targetType, targetId, userId);
        if (error) {
          setIsLiked(true);
          setLikeCount((prev) => prev + 1);
        }
      } else {
        const { error } = await insertLike(supabase, targetType, targetId, userId);
        if (error) {
          setIsLiked(false);
          setLikeCount((prev) => prev - 1);
        }
      }
    } catch {
      // Rollback on network error
      setIsLiked(wasLiked);
      setLikeCount((prev) => prev + (wasLiked ? 1 : -1));
    } finally {
      setLoading(false);
    }
  }, [userId, loading, isLiked, targetType, targetId]);

  return { isLiked, likeCount, toggleLike, loading };
}
