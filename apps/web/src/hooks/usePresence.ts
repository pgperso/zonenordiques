'use client';

import { useEffect, useState, useRef } from 'react';
import { useSupabase } from '@/hooks/useSupabase';

export type PresenceStatus = 'online' | 'idle';

export interface PresenceMember {
  memberId: string;
  username: string;
  avatarUrl: string | null;
  status: PresenceStatus;
}

interface UsePresenceReturn {
  onlineMembers: PresenceMember[];
  onlineCount: number;
}

export function usePresence(
  communityId: number,
  userId: string | null,
  username: string | null,
  avatarUrl: string | null = null,
): UsePresenceReturn {
  const [onlineMembers, setOnlineMembers] = useState<PresenceMember[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const supabase = useSupabase();

  // Use refs for values that change but should NOT trigger re-subscription
  const avatarUrlRef = useRef(avatarUrl);
  avatarUrlRef.current = avatarUrl;
  const usernameRef = useRef(username);
  usernameRef.current = username;

  useEffect(() => {
    if (!userId || !username) return;

    const channel = supabase.channel(`presence:${communityId}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    // Rebuild the member list from the full presence state. Runs on every
    // presence event — sync, join AND leave. There is deliberately no
    // debounce: an earlier 500ms trailing debounce could be reset forever
    // by a steady trickle of presence events in an active tribune, leaving
    // the list frozen and members who were genuinely there invisible.
    function syncPresence() {
      const state = channel.presenceState<{
        memberId: string;
        username: string;
        avatarUrl: string | null;
        status?: PresenceStatus;
      }>();
      const members: PresenceMember[] = [];
      for (const key in state) {
        const presences = state[key];
        if (presences && presences.length > 0) {
          members.push({
            memberId: presences[0].memberId,
            username: presences[0].username,
            avatarUrl: presences[0].avatarUrl,
            status: presences[0].status ?? 'online',
          });
        }
      }
      setOnlineMembers(members);
    }

    // Track returns 'ok' / 'timed out' / 'rate limited'. A silent failure
    // here was the root cause of the "members are talking but I don't see
    // them online" bug: chat messages travel through postgres_changes and
    // always arrive, but presence relies on this track() call landing on
    // the server. One failed track meant the user stayed invisible until
    // they navigated away and back.
    async function trackStatus() {
      const ch = channelRef.current;
      if (!ch) return;
      const status: PresenceStatus = document.visibilityState === 'visible' ? 'online' : 'idle';
      const result = await ch.track({
        memberId: userId,
        username: usernameRef.current,
        avatarUrl: avatarUrlRef.current,
        status,
      });
      if (result !== 'ok') {
        // One-shot retry. The next heartbeat will catch any second failure.
        setTimeout(() => {
          channelRef.current?.track({
            memberId: userId,
            username: usernameRef.current,
            avatarUrl: avatarUrlRef.current,
            status,
          });
        }, 1500);
      }
    }

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, syncPresence)
      .on('presence', { event: 'leave' }, syncPresence)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await trackStatus();
        }
      });

    // Heartbeat: re-track every 60s as a safety net for silent
    // websocket reconnects. Supabase auto-resubscribes the channel on
    // reconnect but presence track() is a one-shot client-state push —
    // if the initial track fired before the reconnect, our presence is
    // gone server-side until we re-publish it. The heartbeat caps that
    // window at 60s.
    //
    // Cost: presence runs over Realtime, NOT the database, so this only
    // consumes Realtime messages (not DB reads/writes). 60s × visible
    // users keeps it well under the Pro plan's 5M msgs/month budget
    // even for a few hundred concurrent users.
    const heartbeat = setInterval(() => {
      void trackStatus();
    }, 60_000);

    // Listen to visibility changes for idle detection
    document.addEventListener('visibilitychange', trackStatus);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', trackStatus);
      channel.untrack();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // Only re-subscribe when community or user identity changes
    // avatarUrl changes are picked up via ref (no teardown needed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [communityId, userId, username, supabase]);

  return {
    onlineMembers,
    onlineCount: onlineMembers.length,
  };
}
