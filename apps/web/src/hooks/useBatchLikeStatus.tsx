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
  smileys: {
    messages: Set<number>;
  };
  surprises: {
    messages: Set<number>;
  };
}

interface BatchLikeContextValue {
  isLiked: (type: LikeTargetType, id: number) => boolean;
  setLiked: (type: LikeTargetType, id: number, liked: boolean) => void;
  isDisliked: (id: number) => boolean;
  setDisliked: (id: number, disliked: boolean) => void;
  isSmileyed: (id: number) => boolean;
  setSmileyed: (id: number, smileyed: boolean) => void;
  isSurprised: (id: number) => boolean;
  setSurprised: (id: number, surprised: boolean) => void;
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
    smileys: { messages: new Set() },
    surprises: { messages: new Set() },
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
      messageIds.length > 0
        ? supabase
            .from('message_smileys')
            .select('message_id')
            .eq('member_id', userId)
            .in('message_id', messageIds)
        : { data: [] },
      messageIds.length > 0
        ? supabase
            .from('message_surprises')
            .select('message_id')
            .eq('member_id', userId)
            .in('message_id', messageIds)
        : { data: [] },
    ]).then(([msgLikes, artLikes, podLikes, msgDislikes, msgSmileys, msgSurprises]) => {
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
        smileys: {
          messages: new Set(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (msgSmileys.data ?? []).map((r: any) => r.message_id as number),
          ),
        },
        surprises: {
          messages: new Set(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (msgSurprises.data ?? []).map((r: any) => r.message_id as number),
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

  // A message holds at most one reaction, so setting one clears the other
  // three. Helper: the other message-reaction sets with `id` removed.
  function clearOthers(prev: ReactionStatusMap, id: number, keep: 'likes' | 'dislikes' | 'smileys' | 'surprises') {
    const drop = (s: Set<number>) => { const n = new Set(s); n.delete(id); return n; };
    return {
      likes: keep === 'likes' ? prev.likes : { ...prev.likes, messages: drop(prev.likes.messages) },
      dislikes: keep === 'dislikes' ? prev.dislikes : { messages: drop(prev.dislikes.messages) },
      smileys: keep === 'smileys' ? prev.smileys : { messages: drop(prev.smileys.messages) },
      surprises: keep === 'surprises' ? prev.surprises : { messages: drop(prev.surprises.messages) },
    };
  }

  const setLiked = useCallback((type: LikeTargetType, id: number, liked: boolean) => {
    setStatus((prev) => {
      const key = typeKey(type);
      const nextLikes = new Set(prev.likes[key]);
      if (liked) nextLikes.add(id);
      else nextLikes.delete(id);
      // Article/podcast likes are independent; only message likes are exclusive.
      if (type !== 'message') {
        return { ...prev, likes: { ...prev.likes, [key]: nextLikes } };
      }
      const cleared = liked ? clearOthers(prev, id, 'likes') : prev;
      return { ...cleared, likes: { ...cleared.likes, messages: nextLikes } };
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
      const cleared = disliked ? clearOthers(prev, id, 'dislikes') : prev;
      return { ...cleared, dislikes: { messages: nextDislikes } };
    });
  }, []);

  const isSmileyed = useCallback(
    (id: number) => status.smileys.messages.has(id),
    [status],
  );

  const setSmileyed = useCallback((id: number, smileyed: boolean) => {
    setStatus((prev) => {
      const nextSmileys = new Set(prev.smileys.messages);
      if (smileyed) nextSmileys.add(id);
      else nextSmileys.delete(id);
      const cleared = smileyed ? clearOthers(prev, id, 'smileys') : prev;
      return { ...cleared, smileys: { messages: nextSmileys } };
    });
  }, []);

  const isSurprised = useCallback(
    (id: number) => status.surprises.messages.has(id),
    [status],
  );

  const setSurprised = useCallback((id: number, surprised: boolean) => {
    setStatus((prev) => {
      const nextSurprises = new Set(prev.surprises.messages);
      if (surprised) nextSurprises.add(id);
      else nextSurprises.delete(id);
      const cleared = surprised ? clearOthers(prev, id, 'surprises') : prev;
      return { ...cleared, surprises: { messages: nextSurprises } };
    });
  }, []);

  const value = useMemo(
    () => ({ isLiked, setLiked, isDisliked, setDisliked, isSmileyed, setSmileyed, isSurprised, setSurprised }),
    [isLiked, setLiked, isDisliked, setDisliked, isSmileyed, setSmileyed, isSurprised, setSurprised],
  );

  return <BatchLikeContext.Provider value={value}>{children}</BatchLikeContext.Provider>;
}

export function useBatchLikeStatus() {
  return useContext(BatchLikeContext);
}
