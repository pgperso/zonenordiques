'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { useSupabase } from '@/hooks/useSupabase';
import { BRAND } from '@/lib/brand';
import { ShareButton } from '@/components/ui/ShareButton';
import { castPollVote, fetchPollOptions, type Poll, type PollOption } from '@/services/pollService';

interface PollBlockProps {
  poll: Poll | null;
}

// localStorage keys. The voter key is one persistent UUID per browser;
// the per-poll flag records that this browser already voted (and for
// which option) so results show immediately on return visits.
const VOTER_KEY_STORAGE = 'ft_poll_voter_key';
const votedStorageKey = (pollId: number) => `ft_poll_voted_${pollId}`;

function getOrCreateVoterKey(): string {
  try {
    let key = localStorage.getItem(VOTER_KEY_STORAGE);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(VOTER_KEY_STORAGE, key);
    }
    return key;
  } catch {
    // Private mode / storage disabled — fall back to an ephemeral key.
    return crypto.randomUUID();
  }
}

/**
 * Reader poll shown in the gallery sidebar above "Top of the week".
 *
 * Voting is open to everyone; deduplication is best-effort via a
 * localStorage voter key (see pollService / migration 00058). After a
 * vote — or on return visits where the localStorage flag is set — the
 * block switches to a results view with percentage bars.
 */
export function PollBlock({ poll }: PollBlockProps) {
  const locale = useLocale();
  const supabase = useSupabase();
  const isFr = locale === 'fr';

  const [options, setOptions] = useState<PollOption[]>(poll?.options ?? []);
  const [voted, setVoted] = useState(false);
  const [votedOptionId, setVotedOptionId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On mount, check whether this browser already voted on this poll.
  useEffect(() => {
    if (!poll) return;
    try {
      const stored = localStorage.getItem(votedStorageKey(poll.id));
      if (stored) {
        setVoted(true);
        setVotedOptionId(Number(stored) || null);
      }
    } catch {
      /* storage unavailable — treat as not voted */
    }
  }, [poll]);

  // The `poll` prop is frozen in the ISR-cached page, so its vote counts
  // go stale within minutes. Re-fetch the live counts on mount and follow
  // them in realtime, so the poll visibly accumulates votes from everyone.
  useEffect(() => {
    if (!poll) return;
    let cancelled = false;

    fetchPollOptions(supabase, poll.id).then((fresh) => {
      if (!cancelled && fresh.length > 0) setOptions(fresh);
    });

    const channel = supabase
      .channel(`poll-${poll.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'poll_options',
          filter: `poll_id=eq.${poll.id}`,
        },
        (payload) => {
          const row = payload.new as { id?: number; vote_count?: number } | undefined;
          if (row?.id == null || row.vote_count == null) return;
          setOptions((prev) =>
            prev.map((o) =>
              o.id === row.id ? { ...o, voteCount: row.vote_count as number } : o,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [poll, supabase]);

  const handleVote = useCallback(
    async (optionId: number) => {
      if (!poll || busy || voted) return;
      setBusy(true);
      setError(null);

      const voterKey = getOrCreateVoterKey();
      const result = await castPollVote(supabase, poll.id, optionId, voterKey);

      if (result === 'ok' || result === 'already_voted') {
        // Optimistically reflect the vote (only bump on a fresh 'ok').
        if (result === 'ok') {
          setOptions((prev) =>
            prev.map((o) => (o.id === optionId ? { ...o, voteCount: o.voteCount + 1 } : o)),
          );
        }
        setVoted(true);
        setVotedOptionId(optionId);
        try {
          localStorage.setItem(votedStorageKey(poll.id), String(optionId));
        } catch {
          /* ignore */
        }
      } else if (result === 'poll_inactive') {
        setError(isFr ? 'Ce sondage est terminé.' : 'This poll has closed.');
      } else {
        setError(isFr ? 'Le vote a échoué. Réessayez.' : 'Vote failed. Try again.');
      }
      setBusy(false);
    },
    [poll, busy, voted, supabase, isFr],
  );

  if (!poll) return null;

  const totalVotes = options.reduce((s, o) => s + o.voteCount, 0);
  const heading = isFr ? 'Sondage' : 'Poll';

  return (
    <section
      aria-label={heading}
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-brand-blue/[0.03] dark:bg-brand-blue/[0.07] p-4"
    >
      <div className="mb-1 flex items-center gap-1.5">
        <svg className="h-4 w-4 text-brand-blue" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
        </svg>
        <h2 className="text-sm font-bold uppercase tracking-wider text-brand-blue">
          {heading}
        </h2>
        <ShareButton
          url={`${BRAND.url}/${locale}`}
          title={poll.question}
          className="ml-auto flex items-center rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-gray-800"
        />
      </div>

      <p className="mb-3 text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
        {poll.question}
      </p>

      {!voted ? (
        <ul className="space-y-2">
          {options.map((o) => (
            <li key={o.id}>
              <button
                onClick={() => handleVote(o.id)}
                disabled={busy}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-left text-sm font-medium text-gray-800 dark:text-gray-200 transition hover:border-brand-blue hover:bg-brand-blue/5 disabled:opacity-50"
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-2">
          {options.map((o) => {
            const pct = totalVotes > 0 ? Math.round((o.voteCount / totalVotes) * 100) : 0;
            const isChoice = o.id === votedOptionId;
            return (
              <li key={o.id}>
                <div className="relative overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                  <div
                    className={`absolute inset-y-0 left-0 ${isChoice ? 'bg-brand-blue/20' : 'bg-gray-100 dark:bg-gray-800'}`}
                    style={{ width: `${pct}%` }}
                    aria-hidden="true"
                  />
                  <div className="relative flex items-center justify-between px-3 py-2 text-sm">
                    <span className={`font-medium ${isChoice ? 'text-brand-blue' : 'text-gray-700 dark:text-gray-300'}`}>
                      {isChoice && '✓ '}{o.label}
                    </span>
                    <span className="ml-2 shrink-0 font-bold tabular-nums text-gray-900 dark:text-gray-100">
                      {pct}%
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <p className="mt-3 text-[11px] text-gray-400">
        {totalVotes > 0
          ? isFr
            ? `${totalVotes.toLocaleString('fr-CA')} vote${totalVotes > 1 ? 's' : ''}`
            : `${totalVotes.toLocaleString('en-CA')} vote${totalVotes > 1 ? 's' : ''}`
          : isFr
            ? 'Soyez le premier à voter'
            : 'Be the first to vote'}
      </p>
    </section>
  );
}
