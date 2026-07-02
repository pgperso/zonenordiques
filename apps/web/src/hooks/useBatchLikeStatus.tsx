'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSupabase } from '@/hooks/useSupabase';

type LikeTargetType = 'message' | 'article' | 'podcast';

interface ReactionStatusMap {
  likes: {
    messages: Set<number>;
    articles: Set<number>;
    podcasts: Set<number>;
  };
  dislikes: {
    messages: Set<number>;
  };
}

interface BatchLikeContextValue {
  isLiked: (type: LikeTargetType, id: number) => boolean;
  setLiked: (type: LikeTargetType, id: number, liked: boolean) => void;
  isDisliked: (id: number) => boolean;
  setDisliked: (id: number, disliked: boolean) => void;
}

const BatchLikeContext = createContext<BatchLikeContextValue | null>(null);

function typeKey(type: LikeTargetType): 'messages' | 'articles' | 'podcasts' {
  if (type === 'message') return 'messages';
  if (type === 'article') return 'articles';
  return 'podcasts';
}

interface BatchLikeProviderProps {
  userId: string | null;
  messageIds: number[];
  articleIds: number[];
  podcastIds: number[];
  children: React.ReactNode;
}

export function BatchLikeProvider({
  userId,
  messageIds,
  articleIds,
  podcastIds,
  children,
}: BatchLikeProviderProps) {
  const [status, setStatus] = useState<ReactionStatusMap>({
    likes: { messages: new Set(), articles: new Set(), podcasts: new Set() },
    dislikes: { messages: new Set() },
  });
  const supabase = useSupabase();
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    if (messageIds.length === 0 && articleIds.length === 0 && podcastIds.length === 0) return;

    let cancelled = false;
    fetchedRef.current = false;

    Promise.all([
      messageIds.length > 0
        ? supabase
            .from('message_likes')
            .select('message_id')
            .eq('member_id', userId)
            .in('message_id', messageIds)
        : { data: [] },
      articleIds.length > 0
        ? supabase
            .from('article_likes')
            .select('article_id')
            .eq('member_id', userId)
            .in('article_id', articleIds)
        : { data: [] },
      podcastIds.length > 0
        ? supabase
            .from('podcast_likes')
            .select('podcast_id')
            .eq('member_id', userId)
            .in('podcast_id', podcastIds)
        : { data: [] },
      messageIds.length > 0
        ? supabase
            .from('message_dislikes')
            .select('message_id')
            .eq('member_id', userId)
            .in('message_id', messageIds)
        : { data: [] },
    ]).then(([msgLikes, artLikes, podLikes, msgDislikes]) => {
      if (cancelled) return;
      fetchedRef.current = true;
      setStatus({
        likes: {
          messages: new Set(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (msgLikes.data ?? []).map((r: any) => r.message_id as number),
          ),
          articles: new Set(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (artLikes.data ?? []).map((r: any) => r.article_id as number),
          ),
          podcasts: new Set(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (podLikes.data ?? []).map((r: any) => r.podcast_id as number),
          ),
        },
        dislikes: {
          messages: new Set(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (msgDislikes.data ?? []).map((r: any) => r.message_id as number),
          ),
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [userId, messageIds, articleIds, podcastIds]);

  const isLiked = useCallback(
    (type: LikeTargetType, id: number) => status.likes[typeKey(type)].has(id),
    [status],
  );

  const setLiked = useCallback((type: LikeTargetType, id: number, liked: boolean) => {
    setStatus((prev) => {
      const key = typeKey(type);
      const nextLikes = new Set(prev.likes[key]);
      if (liked) nextLikes.add(id);
      else nextLikes.delete(id);
      // If liking, remove dislike (mutual exclusion)
      let nextDislikes = prev.dislikes;
      if (liked && type === 'message') {
        const ds = new Set(prev.dislikes.messages);
        ds.delete(id);
        nextDislikes = { messages: ds };
      }
      return { likes: { ...prev.likes, [key]: nextLikes }, dislikes: nextDislikes };
    });
  }, []);

  const isDisliked = useCallback(
    (id: number) => status.dislikes.messages.has(id),
    [status],
  );

  const setDisliked = useCallback((id: number, disliked: boolean) => {
    setStatus((prev) => {
      const nextDislikes = new Set(prev.dislikes.messages);
      if (disliked) nextDislikes.add(id);
      else nextDislikes.delete(id);
      // If disliking, remove like (mutual exclusion)
      let nextLikes = prev.likes;
      if (disliked) {
        const ls = new Set(prev.likes.messages);
        ls.delete(id);
        nextLikes = { ...prev.likes, messages: ls };
      }
      return { likes: nextLikes, dislikes: { messages: nextDislikes } };
    });
  }, []);

  const value = useMemo(() => ({ isLiked, setLiked, isDisliked, setDisliked }), [isLiked, setLiked, isDisliked, setDisliked]);

  return <BatchLikeContext.Provider value={value}>{children}</BatchLikeContext.Provider>;
}

export function useBatchLikeStatus() {
  return useContext(BatchLikeContext);
}
