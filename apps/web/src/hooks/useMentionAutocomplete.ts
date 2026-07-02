'use client';

import { useCallback, useRef, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';

export interface MentionMember {
  id: string;
  username: string;
  avatarUrl: string | null;
}

// An in-progress "@token" sitting immediately before the cursor: the start
// of the line or a space, then '@', then up to 30 username characters.
const ACTIVE_MENTION = /(?:^|\s)@([A-Za-z0-9_]{0,30})$/;

/**
 * Drives an @mention autocomplete over a plain <textarea>. The component
 * owns the textarea value; this hook detects the active "@token", queries
 * the community's members, and computes the spliced text on selection.
 */
export function useMentionAutocomplete(communityId: number) {
  const supabase = useSupabase();
  const [suggestions, setSuggestions] = useState<MentionMember[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  // Index of the '@' that starts the active token, or null when inactive.
  const mentionStartRef = useRef<number | null>(null);
  // Guards against out-of-order query responses.
  const queryIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    mentionStartRef.current = null;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSuggestions([]);
    setActiveIndex(0);
  }, []);

  const runQuery = useCallback(
    (prefix: string) => {
      const qid = ++queryIdRef.current;
      void supabase
        .from('members')
        .select('id, username, avatar_url, community_members!inner(community_id)')
        .eq('community_members.community_id', communityId)
        .ilike('username', `${prefix}%`)
        .order('username')
        .limit(6)
        .then(({ data }) => {
          if (qid !== queryIdRef.current || mentionStartRef.current == null) return;
          setSuggestions(
            (data ?? []).map((m) => ({
              id: m.id as string,
              username: m.username as string,
              avatarUrl: (m.avatar_url as string | null) ?? null,
            })),
          );
          setActiveIndex(0);
        });
    },
    [supabase, communityId],
  );

  /** Re-evaluate the autocomplete against the textarea value + caret. */
  const detect = useCallback(
    (value: string, cursor: number) => {
      const match = ACTIVE_MENTION.exec(value.slice(0, cursor));
      if (!match) {
        reset();
        return;
      }
      mentionStartRef.current = cursor - match[1].length - 1;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runQuery(match[1]), 120);
    },
    [reset, runQuery],
  );

  const move = useCallback(
    (dir: 1 | -1) => {
      setActiveIndex((i) => {
        const n = suggestions.length;
        return n === 0 ? 0 : (i + dir + n) % n;
      });
    },
    [suggestions.length],
  );

  /** Replace the in-progress "@token" with "@username ", return new caret. */
  const apply = useCallback(
    (member: MentionMember, value: string, cursor: number): { text: string; cursor: number } => {
      const start = mentionStartRef.current;
      reset();
      if (start == null) return { text: value, cursor };
      const before = value.slice(0, start);
      const insert = `@${member.username} `;
      return {
        text: before + insert + value.slice(cursor),
        cursor: before.length + insert.length,
      };
    },
    [reset],
  );

  return {
    suggestions,
    activeIndex,
    open: suggestions.length > 0 && mentionStartRef.current != null,
    detect,
    reset,
    move,
    apply,
  };
}
