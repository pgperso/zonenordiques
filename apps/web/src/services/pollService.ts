import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@arena/supabase-client';

// Poll tables were added in migration 00058 — the generated Database
// type doesn't know them yet, so queries are cast through unknown.
type AnyClient = SupabaseClient<Database>;

export type PollStatus = 'pending_review' | 'scheduled' | 'active' | 'archived' | 'rejected';

export interface PollOption {
  id: number;
  label: string;
  sortOrder: number;
  voteCount: number;
}

export interface Poll {
  id: number;
  question: string;
  status: PollStatus;
  createdBy: 'ai' | 'admin';
  createdAt: string;
  // When a scheduled poll should go live (ISO). Null for non-scheduled.
  scheduledFor: string | null;
  options: PollOption[];
  totalVotes: number;
}

type PollRow = {
  id: number;
  question: string;
  status: PollStatus;
  created_by: 'ai' | 'admin';
  created_at: string;
  scheduled_for: string | null;
};

type OptionRow = {
  id: number;
  poll_id: number;
  label: string;
  sort_order: number;
  vote_count: number;
};

function assemble(poll: PollRow, options: OptionRow[]): Poll {
  const opts = options
    .filter((o) => o.poll_id === poll.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((o) => ({
      id: o.id,
      label: o.label,
      sortOrder: o.sort_order,
      voteCount: o.vote_count,
    }));
  return {
    id: poll.id,
    question: poll.question,
    status: poll.status,
    createdBy: poll.created_by,
    createdAt: poll.created_at,
    scheduledFor: poll.scheduled_for,
    options: opts,
    totalVotes: opts.reduce((s, o) => s + o.voteCount, 0),
  };
}

const POLL_SELECT = 'id, question, status, created_by, created_at, scheduled_for';

/** Loads the options for a set of polls and assembles full Poll objects. */
async function withOptions(supabase: AnyClient, polls: PollRow[]): Promise<Poll[]> {
  if (polls.length === 0) return [];
  const { data: optData } = await supabase
    .from('poll_options')
    .select('id, poll_id, label, sort_order, vote_count')
    .in('poll_id', polls.map((p) => p.id));
  const options = (optData ?? []) as unknown as OptionRow[];
  return polls.map((p) => assemble(p, options));
}

/** The single poll currently shown in the gallery, or null if none. */
export async function fetchActivePoll(supabase: AnyClient): Promise<Poll | null> {
  const { data: pollData } = await supabase
    .from('polls')
    .select(POLL_SELECT)
    .eq('status', 'active')
    .order('activated_at', { ascending: false })
    .limit(1);

  const polls = (pollData ?? []) as unknown as PollRow[];
  if (polls.length === 0) return null;
  return (await withOptions(supabase, polls))[0] ?? null;
}

/**
 * Live option counts for one poll. PollBlock calls this on mount so the
 * sidebar never shows the stale vote totals frozen into the ISR-cached
 * page — the counts are always current as of page load.
 */
export async function fetchPollOptions(
  supabase: AnyClient,
  pollId: number,
): Promise<PollOption[]> {
  const { data } = await supabase
    .from('poll_options')
    .select('id, poll_id, label, sort_order, vote_count')
    .eq('poll_id', pollId);
  const rows = (data ?? []) as unknown as OptionRow[];
  return rows
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((o) => ({
      id: o.id,
      label: o.label,
      sortOrder: o.sort_order,
      voteCount: o.vote_count,
    }));
}

/** AI proposals awaiting the owner's validation. */
export async function fetchPendingPolls(supabase: AnyClient): Promise<Poll[]> {
  const { data: pollData } = await supabase
    .from('polls')
    .select(POLL_SELECT)
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false });
  return withOptions(supabase, (pollData ?? []) as unknown as PollRow[]);
}

/** Approved polls queued for publication, ordered by their go-live date. */
export async function fetchScheduledPolls(supabase: AnyClient): Promise<Poll[]> {
  const { data: pollData } = await supabase
    .from('polls')
    .select(POLL_SELECT)
    .eq('status', 'scheduled')
    .order('scheduled_for', { ascending: true });
  return withOptions(supabase, (pollData ?? []) as unknown as PollRow[]);
}

/**
 * Cast a vote. voterKey is a UUID the browser keeps in localStorage so
 * the same browser can't vote twice. Returns the RPC status string.
 */
export async function castPollVote(
  supabase: AnyClient,
  pollId: number,
  optionId: number,
  voterKey: string,
): Promise<'ok' | 'already_voted' | 'poll_inactive' | 'invalid_option' | 'invalid_voter' | 'error'> {
  const { data, error } = await supabase.rpc('cast_poll_vote' as never, {
    p_poll_id: pollId,
    p_option_id: optionId,
    p_voter_key: voterKey,
  } as never);
  if (error) return 'error';
  return (data as 'ok' | 'already_voted' | 'poll_inactive' | 'invalid_option' | 'invalid_voter') ?? 'error';
}

/**
 * Promote the earliest scheduled poll to active — but only if nothing
 * is currently active. Keeps the gallery from sitting empty when polls
 * are queued. Owner-only (RLS).
 */
async function promoteIfGalleryEmpty(supabase: AnyClient): Promise<void> {
  const { data: active } = await supabase
    .from('polls')
    .select('id')
    .eq('status', 'active')
    .limit(1);
  if (active && active.length > 0) return;

  const { data: next } = await supabase
    .from('polls')
    .select('id')
    .eq('status', 'scheduled')
    .order('scheduled_for', { ascending: true })
    .limit(1);
  const nextId = (next as { id: number }[] | null)?.[0]?.id;
  if (nextId) {
    await supabase
      .from('polls')
      .update({ status: 'active', activated_at: new Date().toISOString() } as never)
      .eq('id', nextId);
  }
}

/**
 * Approve a pending poll into the publication queue with a go-live
 * date. The daily rotation cron promotes it to active once the date
 * arrives. If nothing is currently active, the earliest scheduled poll
 * is promoted immediately so the gallery is never empty. Owner-only.
 */
export async function schedulePoll(
  supabase: AnyClient,
  pollId: number,
  scheduledForIso: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('polls')
    .update({ status: 'scheduled', scheduled_for: scheduledForIso } as never)
    .eq('id', pollId);
  if (error) return { error: new Error(error.message) };

  await promoteIfGalleryEmpty(supabase);
  return { error: null };
}

/** Change the go-live date of an already-scheduled poll. */
export async function reschedulePoll(
  supabase: AnyClient,
  pollId: number,
  scheduledForIso: string,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('polls')
    .update({ scheduled_for: scheduledForIso } as never)
    .eq('id', pollId);
  return { error: error ? new Error(error.message) : null };
}

/** Pull a scheduled poll back out of the queue, into pending_review. */
export async function unschedulePoll(
  supabase: AnyClient,
  pollId: number,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('polls')
    .update({ status: 'pending_review', scheduled_for: null } as never)
    .eq('id', pollId);
  return { error: error ? new Error(error.message) : null };
}

/**
 * Retire the current active poll on demand and immediately promote the
 * next poll in the queue. This is the "remove a poll whenever I want
 * to replace it" action. Owner-only.
 */
export async function retireActivePoll(
  supabase: AnyClient,
): Promise<{ error: Error | null }> {
  const archive = await supabase
    .from('polls')
    .update({ status: 'archived', archived_at: new Date().toISOString() } as never)
    .eq('status', 'active');
  if (archive.error) return { error: new Error(archive.error.message) };

  await promoteIfGalleryEmpty(supabase);
  return { error: null };
}

/** Reject a pending poll proposal. */
export async function rejectPoll(
  supabase: AnyClient,
  pollId: number,
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('polls')
    .update({ status: 'rejected' } as never)
    .eq('id', pollId);
  return { error: error ? new Error(error.message) : null };
}

/** Edit a poll's question and option labels before approving it. */
export async function updatePoll(
  supabase: AnyClient,
  pollId: number,
  question: string,
  options: { id: number; label: string }[],
): Promise<{ error: Error | null }> {
  const trimmed = question.trim();
  if (trimmed.length < 5) return { error: new Error('Question trop courte') };

  const q = await supabase
    .from('polls')
    .update({ question: trimmed.slice(0, 300) } as never)
    .eq('id', pollId);
  if (q.error) return { error: new Error(q.error.message) };

  for (const opt of options) {
    const label = opt.label.trim().slice(0, 120);
    if (!label) continue;
    const r = await supabase
      .from('poll_options')
      .update({ label } as never)
      .eq('id', opt.id);
    if (r.error) return { error: new Error(r.error.message) };
  }

  return { error: null };
}
