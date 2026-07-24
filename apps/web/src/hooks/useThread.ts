'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ThreadMessage {
  id: number;
  memberId: string | null;
  content: string | null;
  imageUrls: string[];
  audioUrl: string | null;
  createdAt: string;
  member: { username: string; avatarUrl: string | null; messageCount: number } | null;
}

const REPLY_SELECT =
  'id, member_id, content, image_urls, audio_url, created_at, members:members!chat_messages_member_id_fkey(id, username, avatar_url, message_count)';

interface Row {
  id: number;
  member_id: string | null;
  content: string | null;
  image_urls: string[] | null;
  audio_url: string | null;
  created_at: string;
  members: { username: string; avatar_url: string | null; message_count: number } | null;
}

function mapRow(row: Row): ThreadMessage {
  return {
    id: row.id,
    memberId: row.member_id,
    content: row.content,
    imageUrls: row.image_urls ?? [],
    audioUrl: row.audio_url ?? null,
    createdAt: row.created_at,
    member: row.members
      ? { username: row.members.username, avatarUrl: row.members.avatar_url, messageCount: row.members.message_count }
      : null,
  };
}

/**
 * Loads the direct replies to a root chat message (1-level thread) and keeps
 * them live. Any insert/update on a reply to this root refetches the small
 * reply set — cheap and always consistent (no per-row merge to get wrong).
 */
export function useThread(rootId: number | null) {
  const [replies, setReplies] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReplies = useCallback(async () => {
    if (!rootId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('chat_messages')
      .select(REPLY_SELECT)
      .eq('parent_id', rootId)
      .eq('is_removed', false)
      .order('created_at', { ascending: true });
    setReplies(((data ?? []) as unknown as Row[]).map(mapRow));
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
