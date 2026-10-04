'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useSupabase } from '@/hooks/useSupabase';
import { useModalA11y } from '@/hooks/useModalA11y';
import { SITE } from '@/lib/siteConfig';
import { fmtMoney } from '@/components/pool/format';

/**
 * The nudge for a pool entry that was started and never finished.
 *
 * Six teams sat unconfirmed with nothing anywhere telling their owners why
 * they were absent from the standings: "Enregistrer" saves progress and
 * un-confirms, so a member who tweaked their roster after confirming silently
 * dropped out of the pool. The site showed them a complete-looking team and
 * the standings showed nothing.
 *
 * It only ever appears for a member who HAS an entry that is not confirmed —
 * never for a visitor, never for someone who simply hasn't joined. Dismissing
 * snoozes it for two days rather than forever: the point is to get the team
 * finished before the season runs away, not to be swatted once and give up.
 *
 * The checklist mirrors pool_confirm_entry (00073) exactly — roster counts,
 * club pick, budget. Anything else would promise a confirmation the server
 * then refuses. Stars are a warning, not a blocker, because the RPC allows an
 * entry without them; it just quietly forfeits the doubling.
 */
const SNOOZE_KEY = 'pool-incomplete-snoozed-at';
const SNOOZE_MS = 2 * 24 * 60 * 60 * 1000;

interface ChecklistItem {
  label: string;
  value: string;
  ok: boolean;
}

interface Pending {
  entryId: number;
  teamName: string;
  checks: ChecklistItem[];
  blocked: boolean;
  starWarning: boolean;
  /** Free composition is over (00130) — nothing can be added any more. */
  closed: boolean;
}

export function PoolCompletionNudge() {
  const supabase = useSupabase();
  const locale = useLocale();
  const isFr = locale === 'fr';
  const pathname = usePathname();

  const [pending, setPending] = useState<Pending | null>(null);

  // On the composer they are already doing the thing the modal asks for.
  const onComposer = pathname?.includes('/lnh/pool/composer') ?? false;

  useEffect(() => {
    if (!SITE.showPool || onComposer) return;
    let cancelled = false;

    (async () => {
      try {
        const at = Number(localStorage.getItem(SNOOZE_KEY));
        if (Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS) return;
      } catch {
        // Storage blocked (private window, cleared data). Showing the nudge is
        // the safer failure: a repeated reminder beats a team left out.
      }

      const db = supabase as unknown as SupabaseClient;
      const { data: auth } = await db.auth.getUser();
      if (!auth.user || cancelled) return;

      const { data: seasonRow } = await db
        .from('pool_seasons')
        .select('id, roster_f, roster_d, roster_g, roster_teams, budget_cents, stars_enabled')
        .order('nhl_season', { ascending: false })
        .limit(1)
        .maybeSingle();
      const season = seasonRow as {
        id: number; roster_f: number; roster_d: number; roster_g: number;
        roster_teams: number; budget_cents: number; stars_enabled: boolean;
      } | null;
      if (!season || cancelled) return;

      const { data: entryRow } = await db
        .from('pool_entries')
        .select('id, team_name, is_confirmed, is_locked, team_pick, star_forward_id, star_defense_id')
        .eq('season_id', season.id)
        .eq('member_id', auth.user.id)
        .maybeSingle();
      const entry = entryRow as {
        id: number; team_name: string; is_confirmed: boolean; is_locked: boolean;
        team_pick: string | null; star_forward_id: number | null; star_defense_id: number | null;
      } | null;

      // No entry: they never joined, and this modal is not a recruitment
      // poster. Confirmed or locked: nothing to chase.
      if (!entry || entry.is_confirmed || entry.is_locked || cancelled) return;

      const { data: slotRows } = await db
        .from('pool_roster_slots')
        .select('slot_position, price_cents')
        .eq('entry_id', entry.id)
        .is('effective_to', null);
      const slots = (slotRows ?? []) as Array<{ slot_position: string; price_cents: number }>;
      if (cancelled) return;

      const count = (p: string) => slots.filter((s) => s.slot_position === p).length;
      const spent = slots.reduce((n, s) => n + Number(s.price_cents), 0);

      const checks: ChecklistItem[] = [];
      const addRoster = (pos: string, need: number, fr: string, en: string) => {
        if (need <= 0) return;
        const have = count(pos);
        checks.push({ label: isFr ? fr : en, value: `${have} / ${need}`, ok: have === need });
      };
      addRoster('F', season.roster_f, 'Attaquants', 'Forwards');
      addRoster('D', season.roster_d, 'Défenseurs', 'Defensemen');
      addRoster('G', season.roster_g, 'Gardiens', 'Goalies');

      if (season.roster_teams > 0) {
        checks.push({
          label: isFr ? 'Équipe de la LNH' : 'NHL team',
          value: entry.team_pick ?? (isFr ? 'aucune' : 'none'),
          ok: Boolean(entry.team_pick),
        });
      }
      checks.push({
        label: isFr ? 'Masse salariale' : 'Cap used',
        value: `${fmtMoney(spent, locale)} / ${fmtMoney(season.budget_cents, locale)}`,
        ok: spent <= season.budget_cents,
      });

      // Once the pool has started the composer is trade-only, so sending an
      // incomplete team there would promise something the server refuses.
      const { data: closedRaw } = await db.rpc('pool_composition_closed', { p_season_id: season.id });

      setPending({
        entryId: entry.id,
        teamName: entry.team_name,
        checks,
        blocked: checks.some((c) => !c.ok),
        starWarning:
          season.stars_enabled && (!entry.star_forward_id || !entry.star_defense_id),
        closed: Boolean(closedRaw),
      });
    })();

    return () => { cancelled = true; };
  }, [supabase, isFr, locale, onComposer]);

  const snooze = useCallback(() => {
    setPending(null);
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* ignore */ }
  }, []);

  if (!pending) return null;
  return <NudgeDialog pending={pending} isFr={isFr} onSnooze={snooze} />;
}

/**
 * Split out so useModalA11y mounts WITH the dialog. Left in the parent, its
 * effect runs on page load against an empty ref — focus never moves into the
 * dialog and Tab never gets trapped.
 */
function NudgeDialog({
  pending, isFr, onSnooze,
}: { pending: Pending; isFr: boolean; onSnooze: () => void }) {
  const supabase = useSupabase();
  const router = useRouter();
  const modalRef = useModalA11y();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onSnooze(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onSnooze]);

  const confirmEntry = async () => {
    setBusy(true);
    setError(null);
    const db = supabase as unknown as SupabaseClient;
    const { error: rpcError } = await db.rpc('pool_confirm_entry', { p_entry_id: pending.entryId });
    if (rpcError) {
      // The server is the authority. If it refuses, say what it said rather
      // than a generic failure — the checklist evidently missed something.
      setError(rpcError.message);
      setBusy(false);
      return;
    }
    setDone(true);
    setBusy(false);
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* ignore */ }
    router.refresh();
  };

  const snooze = onSnooze;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={snooze}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pool-nudge-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-[#252525]"
      >
        {done ? (
          <div className="py-4 text-center">
            <Check className="mx-auto h-10 w-10 text-green-600" />
            <p className="mt-3 text-base font-semibold text-gray-900 dark:text-gray-100">
              {isFr ? 'Ton équipe est confirmée !' : 'Your team is confirmed!'}
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {isFr ? 'Elle apparaît maintenant au classement.' : 'It now appears in the standings.'}
            </p>
            <button
              onClick={snooze}
              className="mt-4 rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            >
              {isFr ? 'Parfait' : 'Great'}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <h2 id="pool-nudge-title" className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {isFr ? 'Ton équipe n’est pas au classement' : 'Your team is not in the standings'}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {isFr
                    ? `« ${pending.teamName} » n’est pas confirmée, alors elle n’accumule aucun point.`
                    : `“${pending.teamName}” is not confirmed, so it scores no points.`}
                </p>
              </div>
              <button
                onClick={snooze}
                aria-label={isFr ? 'Fermer' : 'Close'}
                className="shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="mt-4 space-y-1.5">
              {pending.checks.map((c) => (
                <li
                  key={c.label}
                  className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/60"
                >
                  <span className="text-gray-600 dark:text-gray-300">{c.label}</span>
                  <span
                    className={`font-semibold tabular-nums ${
                      c.ok ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {c.value}
                  </span>
                </li>
              ))}
            </ul>

            {pending.starWarning && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                {isFr
                  ? 'Aucun joueur vedette assigné : tu perds les points doublés. Ce n’est pas obligatoire, mais ça coûte cher.'
                  : 'No star player assigned: you forfeit the doubled points. Not required, but costly.'}
              </p>
            )}

            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                {error}
              </p>
            )}

            {pending.closed && pending.blocked && (
              <p className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {isFr
                  ? 'Le pool est commencé : la composition est fermée et cette équipe ne peut plus être complétée. Écris au commissaire si tu crois que c’est une erreur.'
                  : 'The pool has started: composition is closed and this team can no longer be completed. Contact the commissioner if you believe this is a mistake.'}
              </p>
            )}

            <div className="mt-4 flex items-center gap-2">
              {pending.closed && pending.blocked ? null : pending.blocked || pending.starWarning ? (
                <button
                  onClick={() => { snooze(); router.push('/lnh/pool/composer'); }}
                  className="flex-1 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  {isFr ? 'Compléter mon équipe' : 'Finish my team'}
                </button>
              ) : (
                <button
                  onClick={confirmEntry}
                  disabled={busy}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isFr ? 'Confirmer mon équipe' : 'Confirm my team'}
                </button>
              )}
              <button
                onClick={snooze}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100 dark:hover:bg-gray-800 ${
                  pending.closed && pending.blocked ? 'flex-1' : ''
                }`}
              >
                {/* Nothing is actionable any more, so "later" would be a lie. */}
                {pending.closed && pending.blocked
                  ? (isFr ? 'Fermer' : 'Close')
                  : (isFr ? 'Plus tard' : 'Later')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
