'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FeedMessage } from '@arena/shared';
import { createClient } from '@/lib/supabase/client';
import { CHAT_MSG_SELECT, messageToFeedItem, type ChatMessageWithJoin } from './useFeed';

/**
 * Loads the direct replies to a root chat message (1-level thread) as full
 * FeedMessage items — so the thread can render them with the real FeedMessage
 * component (edit / like / react / delete). Any insert/update on a reply to
 * this root refetches the small reply set: cheap and always consistent.
 */
export function useThread(rootId: number | null) {
  const [replies, setReplies] = useState<FeedMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReplies = useCallback(async () => {
    if (!rootId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('chat_messages')
      .select(CHAT_MSG_SELECT)
      .eq('parent_id', rootId)
      .eq('is_removed', false)
      .order('created_at', { ascending: true });
    setReplies(((data ?? []) as unknown as ChatMessageWithJoin[]).map(messageToFeedItem));
    setLoading(false);
  }, [rootId]);

  useEffect(() => {
    if (!rootId) {
      setReplies([]);
      return;
    }
    setLoading(true);
    fetchReplies();

    const supabase = createClient();
    const channel = supabase
      .channel(`thread:${rootId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `parent_id=eq.${rootId}` },
        () => fetchReplies(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `parent_id=eq.${rootId}` },
        () => fetchReplies(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [rootId, fetchReplies]);

  return { replies, loading, refetch: fetchReplies };
}
