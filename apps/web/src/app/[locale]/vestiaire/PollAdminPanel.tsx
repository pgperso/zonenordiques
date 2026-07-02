'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useSupabase } from '@/hooks/useSupabase';
import {
  schedulePoll,
  reschedulePoll,
  unschedulePoll,
  retireActivePoll,
  rejectPoll,
  updatePoll,
  type Poll,
} from '@/services/pollService';

interface PollAdminPanelProps {
  pendingPolls: Poll[];
  scheduledPolls: Poll[];
  activePoll: Poll | null;
}

/** yyyy-mm-dd for <input type="date">. */
function toDateInput(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 10);
}

/** Human-readable French date. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-CA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Default go-live date: 14 days after the last queued poll, else today+14. */
function nextSlotInput(scheduled: Poll[]): string {
  const times = scheduled
    .map((p) => p.scheduledFor)
    .filter((d): d is string => Boolean(d))
    .map((d) => new Date(d).getTime());
  const base = times.length > 0 ? new Date(Math.max(...times)) : new Date();
  base.setDate(base.getDate() + 14);
  return base.toISOString().slice(0, 10);
}

/**
 * Owner-only poll management. Three stacked sections:
 *  1. Active poll — what readers see now, with a "retire" action.
 *  2. Publication calendar — approved polls queued with go-live dates;
 *     the daily rotation cron promotes them automatically.
 *  3. Proposals to validate — AI drafts; edit then schedule or reject.
 */
export function PollAdminPanel({ pendingPolls, scheduledPolls, activePoll }: PollAdminPanelProps) {
  const router = useRouter();
  const supabase = useSupabase();
  const [generating, setGenerating] = useState(false);
  const [genMessage, setGenMessage] = useState<string | null>(null);
  const [retireConfirm, setRetireConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = () => router.refresh();

  async function handleGenerate() {
    setGenerating(true);
    setGenMessage(null);
    try {
      const res = await fetch('/api/polls/generate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setGenMessage(data.error ?? 'Échec de la génération');
      } else {
        setGenMessage(`${data.generated} sondage(s) généré(s).`);
        refresh();
      }
    } catch {
      setGenMessage('Erreur réseau.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleRetire() {
    setBusy(true);
    const { error } = await retireActivePoll(supabase);
    setBusy(false);
    setRetireConfirm(false);
    if (!error) refresh();
  }

  return (
    <section className="mb-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] p-5 md:p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Sondages
          {pendingPolls.length > 0 && (
            <span className="ml-2 rounded-full bg-brand-red px-2 py-0.5 text-xs font-bold text-white">
              {pendingPolls.length} à valider
            </span>
          )}
        </h2>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="rounded-lg bg-brand-blue px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
        >
          {generating ? 'Génération...' : 'Générer par IA'}
        </button>
      </div>
      <p className="mb-4 text-xs text-gray-400">
        Génération automatique le 1er et le 15 de chaque mois. Les sondages programmés passent
        en ligne tout seuls à leur date.
      </p>
      {genMessage && (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{genMessage}</p>
      )}

      {/* 1. Active poll */}
      <div className="mb-5">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Sondage actif
        </h3>
        {activePoll ? (
          <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 px-3 py-2.5">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{activePoll.question}</p>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              {activePoll.totalVotes} vote{activePoll.totalVotes > 1 ? 's' : ''}
            </p>
            <div className="mt-2">
              {retireConfirm ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-gray-600 dark:text-gray-400">Retirer ce sondage ?</span>
                  <button
                    onClick={handleRetire}
                    disabled={busy}
                    className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Oui, retirer
                  </button>
                  <button
                    onClick={() => setRetireConfirm(false)}
                    className="rounded border border-gray-300 dark:border-gray-600 px-2 py-1 text-gray-600 dark:text-gray-400"
                  >
                    Annuler
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setRetireConfirm(true)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Retirer et passer au suivant
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-3 text-center text-xs text-gray-400">
            Aucun sondage actif. Programme une proposition ci-dessous.
          </p>
        )}
      </div>

      {/* 2. Publication calendar */}
      {scheduledPolls.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Calendrier de publication
          </h3>
          <ul className="space-y-2">
            {scheduledPolls.map((poll) => (
              <ScheduledPollRow key={poll.id} poll={poll} onChanged={refresh} />
            ))}
          </ul>
        </div>
      )}

      {/* 3. Proposals to validate */}
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Propositions à valider
        </h3>
        {pendingPolls.length === 0 ? (
          <p className="py-3 text-center text-sm text-gray-500 dark:text-gray-400">
            Aucune proposition en attente.
          </p>
        ) : (
          <div className="space-y-4">
            {pendingPolls.map((poll) => (
              <PendingPollCard
                key={poll.id}
                poll={poll}
                defaultDate={nextSlotInput(scheduledPolls)}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ScheduledPollRow({ poll, onChanged }: { poll: Poll; onChanged: () => void }) {
  const supabase = useSupabase();
  const [date, setDate] = useState(toDateInput(poll.scheduledFor));
  const [busy, setBusy] = useState(false);
  const dirty = date !== toDateInput(poll.scheduledFor);

  async function save() {
    if (!date) return;
    setBusy(true);
    const { error } = await reschedulePoll(supabase, poll.id, new Date(date).toISOString());
    setBusy(false);
    if (!error) onChanged();
  }

  async function remove() {
    setBusy(true);
    const { error } = await unschedulePoll(supabase, poll.id);
    setBusy(false);
    if (!error) onChanged();
  }

  return (
    <li className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{poll.question}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-gray-500 dark:text-gray-400">En ligne le</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#1e1e1e] px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
        />
        {dirty && (
          <button
            onClick={save}
            disabled={busy}
            className="rounded bg-brand-blue px-2 py-1 text-xs font-medium text-white hover:bg-brand-blue-dark disabled:opacity-50"
          >
            Enregistrer la date
          </button>
        )}
        <button
          onClick={remove}
          disabled={busy}
          className="ml-auto text-[11px] font-medium text-gray-400 hover:text-red-600"
        >
          Retirer de la file
        </button>
      </div>
    </li>
  );
}

function PendingPollCard({
  poll,
  defaultDate,
  onChanged,
}: {
  poll: Poll;
  defaultDate: string;
  onChanged: () => void;
}) {
  const supabase = useSupabase();
  const [question, setQuestion] = useState(poll.question);
  const [options, setOptions] = useState(poll.options.map((o) => ({ id: o.id, label: o.label })));
  const [date, setDate] = useState(defaultDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    question !== poll.question ||
    options.some((o, i) => o.label !== poll.options[i]?.label);

  async function saveEdits(): Promise<boolean> {
    const { error: err } = await updatePoll(supabase, poll.id, question, options);
    if (err) {
      setError(err.message);
      return false;
    }
    return true;
  }

  async function handleSchedule() {
    if (!date) {
      setError('Choisis une date de publication.');
      return;
    }
    setBusy(true);
    setError(null);
    if (dirty && !(await saveEdits())) {
      setBusy(false);
      return;
    }
    const { error: err } = await schedulePoll(supabase, poll.id, new Date(date).toISOString());
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    onChanged();
  }

  async function handleReject() {
    setBusy(true);
    setError(null);
    const { error: err } = await rejectPoll(supabase, poll.id);
    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }
    onChanged();
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Question
      </label>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        rows={2}
        maxLength={300}
        className="mb-3 w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-blue focus:outline-none"
      />

      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Options
      </label>
      <div className="mb-3 space-y-1.5">
        {options.map((o, i) => (
          <input
            key={o.id}
            value={o.label}
            onChange={(e) =>
              setOptions((prev) => prev.map((p, j) => (j === i ? { ...p, label: e.target.value } : p)))
            }
            maxLength={120}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-blue focus:outline-none"
          />
        ))}
      </div>

      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Date de mise en ligne
      </label>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="mb-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100 focus:border-brand-blue focus:outline-none"
      />

      {error && <p className="mb-2 text-xs text-red-500">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleSchedule}
          disabled={busy}
          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-50"
        >
          {busy ? '...' : 'Programmer'}
        </button>
        <button
          onClick={handleReject}
          disabled={busy}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 transition hover:border-red-500 hover:text-red-600 disabled:opacity-50"
        >
          Rejeter
        </button>
        <span className="ml-auto self-center text-[11px] text-gray-400">
          {date ? `→ ${formatDate(new Date(date).toISOString())}` : ''}
        </span>
      </div>
    </div>
  );
}
