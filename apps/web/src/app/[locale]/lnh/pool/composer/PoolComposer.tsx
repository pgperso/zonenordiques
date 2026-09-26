'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Virtuoso } from 'react-virtuoso';
import { toast } from 'sonner';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AdAnchor } from '@/components/ads/AdAnchor';
import { fmtMoney } from '@/components/pool/format';
import { TeamGoalies } from '@/components/pool/TeamGoalies';
import { PoolNav } from '../PoolNav';
import {
  saveRoster, setTeam, setStars, confirmEntry, makeTransaction, getTradeEligibility,
  type PoolPlayer, type SlotPick, type PoolPosition, type NhlTeamChoice, type TradeEligibility,
} from '@/services/poolService';

type Picker = PoolPosition | 'team' | null;

export function PoolComposer({
  entryId, isLocked, isConfirmed, budgetCents, need, rosterTeams, players, teams, initialPicks, initialTeam,
  transactionsEnabled, maxTransactions, transactionsUsed,
  starsEnabled, initialStarForward, initialStarDefense,
}: {
  entryId: number;
  isLocked: boolean; // draft deadline passed → trade-only
  isConfirmed: boolean;
  budgetCents: number;
  need: { F: number; D: number; G: number };
  rosterTeams: number;
  players: PoolPlayer[];
  teams: NhlTeamChoice[];
  initialPicks: SlotPick[];
  initialTeam: string | null;
  transactionsEnabled: boolean;
  maxTransactions: number;
  transactionsUsed: number;
  starsEnabled: boolean;
  initialStarForward: number | null;
  initialStarDefense: number | null;
}) {
  const t = useTranslations('pool.composer');
  const tPos = useTranslations('pool.positions');
  const tPosS = useTranslations('pool.positionsSingular');
  const tRoster = useTranslations('pool.roster');
  const tRoot = useTranslations('pool');
  const locale = useLocale();
  const router = useRouter();
  const locked = isLocked;
  const [picks, setPicks] = useState<SlotPick[]>(initialPicks);
  const [teamPick, setTeamPick] = useState<string | null>(initialTeam);
  const [starFwd, setStarFwd] = useState<number | null>(initialStarForward);
  const [starDef, setStarDef] = useState<number | null>(initialStarDefense);
  const [confirmed, setConfirmed] = useState(isConfirmed);
  const [picker, setPicker] = useState<Picker>(null);
  const [tradeFor, setTradeFor] = useState<{ playerId: number; pos: PoolPosition } | null>(null);
  const [tradesUsed, setTradesUsed] = useState(transactionsUsed);
  const [busy, setBusy] = useState(false);

  const remainingTrades = transactionsEnabled ? Math.max(0, maxTransactions - tradesUsed) : 0;

  // Who may be traded, and why not (00115). Only meaningful once trades are
  // open. A player missing from this map is treated as tradeable: the server
  // enforces the rule either way, and a failed fetch must not lock the roster.
  const [eligibility, setEligibility] = useState<Map<number, TradeEligibility>>(new Map());
  useEffect(() => {
    if (!locked || !transactionsEnabled) return;
    let cancelled = false;
    void getTradeEligibility(createClient(), entryId)
      .then((rows) => { if (!cancelled) setEligibility(new Map(rows.map((r) => [r.playerId, r]))); })
      .catch(() => { /* server-enforced; the UI just loses its explanation */ });
    return () => { cancelled = true; };
  }, [locked, transactionsEnabled, entryId, picks]);

  const playerById = useMemo(() => new Map(players.map((p) => [p.playerId, p])), [players]);
  const chosen = useMemo(() => new Set(picks.map((p) => p.playerId)), [picks]);
  const counts = useMemo(() => {
    const c = { F: 0, D: 0, G: 0 };
    for (const p of picks) c[p.slotPosition]++;
    return c;
  }, [picks]);
  const teamObj = useMemo(() => teams.find((tm) => tm.abbrev === teamPick) ?? null, [teams, teamPick]);
  // The NHL team pick is free (00114): only players count against the cap.
  const spent = useMemo(
    () => picks.reduce((s, p) => s + (playerById.get(p.playerId)?.priceCents ?? 0), 0),
    [picks, playerById],
  );
  const remaining = budgetCents - spent;

  const sectionDone = (pos: PoolPosition) => counts[pos] === need[pos];
  const teamDone = rosterTeams === 0 || !!teamPick;
  // A star must be chosen for any position that exists this season.
  const starsDone = !starsEnabled || ((need.F === 0 || starFwd !== null) && (need.D === 0 || starDef !== null));
  // As soon as a position has players, leaving its star slot empty is not allowed.
  // Named separately: "you must designate a star" leaves a member hunting
  // through two sections to find which one. Only asked for once a position
  // has players — there is no ★ button to press on an empty section.
  const missingStarF = starsEnabled && need.F > 0 && counts.F > 0 && starFwd === null;
  const missingStarD = starsEnabled && need.D > 0 && counts.D > 0 && starDef === null;
  const starsMissing = missingStarF || missingStarD;
  const complete =
    (['F', 'D', 'G'] as PoolPosition[]).every((p) => need[p] === 0 || sectionDone(p)) && teamDone && starsDone;

  const canAdd = (p: PoolPlayer) =>
    !locked && !chosen.has(p.playerId) && counts[p.position] < need[p.position] && p.priceCents <= remaining;
  const add = (p: PoolPlayer) => { if (canAdd(p)) setPicks((cur) => [...cur, { playerId: p.playerId, slotPosition: p.position }]); };
  const remove = (id: number) => {
    if (locked) return;
    setPicks((cur) => cur.filter((p) => p.playerId !== id));
    setStarFwd((s) => (s === id ? null : s));
    setStarDef((s) => (s === id ? null : s));
  };
  const toggleStar = (pos: PoolPosition, id: number) => {
    if (pos === 'F') setStarFwd((s) => (s === id ? null : id));
    else if (pos === 'D') setStarDef((s) => (s === id ? null : id));
    setConfirmed(false);
  };
  const starIdFor = (pos: PoolPosition) => (pos === 'F' ? starFwd : pos === 'D' ? starDef : null);

  // Trade (post-lock): drop `tradeFor`, add the candidate, if affordable.
  const canTrade = (p: PoolPlayer) => {
    if (!tradeFor || chosen.has(p.playerId)) return false;
    const dropPrice = playerById.get(tradeFor.playerId)?.priceCents ?? 0;
    return spent - dropPrice + p.priceCents <= budgetCents;
  };
  async function doTrade(p: PoolPlayer) {
    if (!tradeFor) return;
    const dropId = tradeFor.playerId;
    setBusy(true);
    const { error } = await makeTransaction(createClient(), entryId, dropId, p.playerId);
    setBusy(false);
    if (error) { toast.error(error); return; }
    setPicks((cur) => cur.map((sp) => (sp.playerId === dropId ? { playerId: p.playerId, slotPosition: tradeFor.pos } : sp)));
    setTradesUsed((u) => u + 1);
    // Trading away a star frees that slot — the pooler re-decides who's the star.
    setStarFwd((s) => (s === dropId ? null : s));
    setStarDef((s) => (s === dropId ? null : s));
    toast.success(t('tradeDone'));
    setTradeFor(null);
  }

  // Post-lock: pick a new star for a position whose slot a trade just emptied.
  async function chooseStarLocked(pos: PoolPosition, id: number) {
    const newFwd = pos === 'F' ? id : starFwd;
    const newDef = pos === 'D' ? id : starDef;
    setBusy(true);
    const { error } = await setStars(createClient(), entryId, newFwd, newDef);
    setBusy(false);
    if (error) { toast.error(error); return; }
    if (pos === 'F') setStarFwd(id); else setStarDef(id);
    toast.success(t('starChosen'));
  }

  async function persist(): Promise<boolean> {
    const c = createClient();
    const r1 = await saveRoster(c, entryId, picks);
    if (r1.error) { toast.error(r1.error); return false; }
    if (rosterTeams > 0) {
      const r2 = await setTeam(c, entryId, teamPick);
      if (r2.error) { toast.error(r2.error); return false; }
    }
    if (starsEnabled) {
      const r3 = await setStars(c, entryId, starFwd, starDef);
      if (r3.error) { toast.error(r3.error); return false; }
    }
    return true;
  }

  async function handleSave() {
    setBusy(true);
    const ok = await persist();
    setBusy(false);
    if (ok) { setConfirmed(false); toast.success(t('progressSaved')); }
  }

  async function handleConfirm() {
    setBusy(true);
    if (!(await persist())) { setBusy(false); return; }
    const { error } = await confirmEntry(createClient(), entryId);
    setBusy(false);
    if (error) { toast.error(error); return; }
    setConfirmed(true);
    toast.success(t('confirmedToast'));
    router.push('/lnh/pool/moi');
  }

  // ── Section card (render fn, not a nested component) ───────────────────────
  const renderPlayerSection = (pos: PoolPosition) => {
    const rows = picks.filter((p) => p.slotPosition === pos);
    const done = sectionDone(pos);
    const emptyCount = Math.max(0, need[pos] - rows.length);
    const canTradeNow = locked && transactionsEnabled && remainingTrades > 0;
    const starrable = starsEnabled && (pos === 'F' || pos === 'D');
    const starId = starIdFor(pos);
    return (
      <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          {tPos(pos)}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${done ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
            {counts[pos]}/{need[pos]}
          </span>
        </h2>
        <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((r) => {
            const p = playerById.get(r.playerId);
            if (!p) return null;
            return (
              <li key={r.playerId} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 truncate text-gray-900 dark:text-gray-100">
                  {starId === r.playerId && <span className="text-amber-500" aria-hidden>★</span>}
                  {p.fullName} <span className="text-xs text-gray-400">{p.teamAbbrev}</span>
                  {!p.draftable && (
                    /* He is on the roster but the pool has retired him, so
                       saving will be refused until he is removed. Said here,
                       on his row, instead of as a player id in a toast after
                       the member presses Save. */
                    <span className="shrink-0 whitespace-nowrap rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                      {t('unavailable')}
                    </span>
                  )}
                  {starId === r.playerId && (
                    /* Spelled out rather than left to the star icon: doubling
                       is the whole reason to designate one, and a member who
                       has not read the rules cannot infer it from a ★.
                       Hidden on a phone, where the row has no space for it and
                       the orange badge already marks the player. */
                    <span className="hidden shrink-0 whitespace-nowrap text-xs font-medium text-amber-600 sm:inline dark:text-amber-400">
                      {t('starDouble')}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  {starrable && !locked && (
                    <button
                      onClick={() => toggleStar(pos, r.playerId)}
                      aria-pressed={starId === r.playerId}
                      className={
                        starId === r.playerId
                          ? 'rounded-md bg-amber-500 px-2 py-1 text-xs font-semibold text-white'
                          : 'rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-[#252525]'
                      }
                    >
                      ★ {t('star')}
                    </button>
                  )}
                  {starrable && locked && starId === null && (
                    <button
                      onClick={() => chooseStarLocked(pos, r.playerId)}
                      disabled={busy}
                      className="rounded-md border border-amber-400 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50 dark:text-amber-300"
                    >
                      ★ {t('star')}
                    </button>
                  )}
                  <span className="tabular-nums text-gray-600 dark:text-gray-300">{fmtMoney(p.priceCents, locale)}</span>
                  {!locked && (
                    <button onClick={() => remove(r.playerId)} className="text-xs font-medium text-red-600 hover:underline">
                      {t('remove')}
                    </button>
                  )}
                  {canTradeNow && (() => {
                    const el = eligibility.get(r.playerId);
                    // Unknown = not loaded yet: show the button and let the
                    // server answer, rather than blocking on a missing fetch.
                    if (el && !el.canTrade) {
                      return (
                        <span
                          className="text-xs text-gray-400"
                          title={t('tradeLockedHint', { required: el.gamesRequired })}
                        >
                          {t('tradeLockedGames', { played: el.gamesPlayed, required: el.gamesRequired })}
                        </span>
                      );
                    }
                    return (
                      <button
                        onClick={() => setTradeFor({ playerId: r.playerId, pos })}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-[#252525]"
                      >
                        {t('trade')}
                        {el?.isOut && <span className="ml-1 text-amber-600" title={t('tradeOutHint')}>●</span>}
                      </button>
                    );
                  })()}
                </span>
              </li>
            );
          })}
          {/* Empty slots, each with its own Choisir button */}
          {!locked && Array.from({ length: emptyCount }).map((_, i) => (
            <li key={`empty-${pos}-${i}`} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="italic text-gray-400">{tPosS(pos)}</span>
              <button
                onClick={() => setPicker(pos)}
                className="shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-gray-900"
              >
                {t('choose')}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  const renderTeamSection = () => (
    <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          {t('teamNhl')}
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${teamDone ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
            {teamPick ? '1/1' : '0/1'}
          </span>
        </h2>
        {!locked && (
          <button onClick={() => setPicker('team')} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900">
            {t('choose')}
          </button>
        )}
      </div>
      {teamObj ? (
        <>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
            <span className="font-medium text-gray-900 dark:text-gray-100">{teamObj.name}</span>
            <span className="flex items-center gap-3 text-xs tabular-nums text-gray-500">
              <span>{teamObj.gp} {t('statGp')} · {teamObj.wins}-{teamObj.losses} · {t('statFor')} {teamObj.gf} / {t('statAgainst')} {teamObj.ga}</span>
            </span>
          </div>
          <TeamGoalies goalies={teamObj.goalies} locale={locale} t={(k) => tRoster(k)} title={tRoot('goaliesTitle')} />
        </>
      ) : (
        <p className="mt-2 text-sm text-gray-400">{t('noTeamChosen')}</p>
      )}
    </section>
  );

  const dropName = tradeFor ? (playerById.get(tradeFor.playerId)?.fullName ?? '') : '';

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white dark:bg-[#1e1e1e]">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-700 dark:bg-[#1e1e1e]/95">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-2"><PoolNav /></div>
          <Link href="/lnh/pool/moi" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
            ← {t('backToMyTeam')}
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`text-sm font-medium ${confirmed ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {confirmed ? t('confirmedActive') : t('toConfirm')}
            </span>
            <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
              {fmtMoney(remaining, locale)} <span className="font-normal text-gray-400">{t('left')} / {fmtMoney(budgetCents, locale)}</span>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div className={`h-full ${spent > budgetCents ? 'bg-red-500' : 'bg-gray-900 dark:bg-white'}`}
              style={{ width: `${budgetCents > 0 ? Math.min(100, (spent / budgetCents) * 100) : 0}%` }} />
          </div>
          {transactionsEnabled && (
            <p className="mt-2 text-xs text-gray-500">
              {t('tradesRemaining')} : <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{remainingTrades}/{maxTransactions}</span>
            </p>
          )}
          {!locked && (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={handleSave} disabled={busy || starsMissing}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-[#252525]">
                  {t('save')}
                </button>
                <button onClick={handleConfirm} disabled={busy || !complete}
                  className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-40 dark:bg-white dark:text-gray-900">
                  {t('confirm')}
                </button>
              </div>
              {starsMissing && (
                <p
                  role="alert"
                  className="mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200"
                >
                  <span aria-hidden className="text-base leading-none">★</span>
                  <span>
                    {missingStarF && missingStarD
                      ? t('starsRequiredBoth')
                      : missingStarF
                        ? t('starsRequiredF')
                        : t('starsRequiredD')}{' '}
                    <span className="font-normal">{t('starsRequiredHow')}</span>
                  </span>
                </p>
              )}
            </>
          )}
          {locked && (
            <>
              <p className="mt-3 text-sm font-medium text-amber-700 dark:text-amber-400">{t('draftClosed')}</p>
              {starsMissing && (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-900/10 dark:text-amber-300">★ {t('starsRequiredTrade')}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Scrollable body — the app <main> is overflow-hidden, so the page must
          provide its own scroll container or the content gets clipped. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
          <p className="text-sm text-gray-500">
            {t.rich('intro', { b: (chunks) => <strong>{chunks}</strong> })}
          </p>
          {starsEnabled && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/10 dark:text-amber-300">
              ★ {t('starsHint')}
            </p>
          )}
          {need.F > 0 && renderPlayerSection('F')}
          {need.D > 0 && renderPlayerSection('D')}
          {need.G > 0 && renderPlayerSection('G')}
          {rosterTeams > 0 && renderTeamSection()}
        </div>
        <AdAnchor />
      </div>

      {/* Add picker */}
      {picker && picker !== 'team' && (
        <PlayerPicker
          mode="add"
          pos={picker}
          players={players}
          chosen={chosen}
          canPick={canAdd}
          onPick={add}
          counts={counts}
          need={need}
          remaining={remaining}
          busy={busy}
          onClose={() => setPicker(null)}
        />
      )}
      {/* Trade picker */}
      {tradeFor && (
        <PlayerPicker
          mode="trade"
          pos={tradeFor.pos}
          players={players}
          chosen={chosen}
          canPick={canTrade}
          onPick={doTrade}
          counts={counts}
          need={need}
          remaining={remaining}
          dropName={dropName}
          busy={busy}
          onClose={() => setTradeFor(null)}
        />
      )}
      {picker === 'team' && (
        <TeamPicker
          teams={teams}
          selected={teamPick}
          onSelect={(abbrev) => { setTeamPick(abbrev); setConfirmed(false); setPicker(null); }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

// ── Player picker modal (one position, add or trade mode) ───────────────────
function PlayerPicker({
  mode, pos, players, chosen, canPick, onPick, counts, need, remaining, dropName, busy, onClose,
}: {
  mode: 'add' | 'trade';
  pos: PoolPosition;
  players: PoolPlayer[];
  chosen: Set<number>;
  canPick: (p: PoolPlayer) => boolean;
  onPick: (p: PoolPlayer) => void;
  counts: Record<PoolPosition, number>;
  need: { F: number; D: number; G: number };
  remaining: number;
  dropName?: string;
  busy?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('pool.composer');
  const tPos = useTranslations('pool.positions');
  const locale = useLocale();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'priceDesc' | 'priceAsc' | 'proj'>('priceDesc');
  const [affordableOnly, setAffordableOnly] = useState(false);
  const [team, setTeam] = useState('');

  // Only the clubs that actually have a player at this position left to pick:
  // a dropdown offering all 32 when six of them have nothing to show is a
  // list of dead ends.
  const teamOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const p of players) {
      if (p.position === pos && p.draftable && !chosen.has(p.playerId) && p.teamAbbrev) seen.add(p.teamAbbrev);
    }
    return [...seen].sort();
  }, [players, pos, chosen]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Always hide players already on the roster — you can't pick them again.
    // draftable === false means he is on someone's roster but retired from
    // the pool: shown where he already sits, never offered to anyone.
    let l = players.filter((p) => p.position === pos && p.draftable && !chosen.has(p.playerId));
    if (team) l = l.filter((p) => p.teamAbbrev === team);
    if (affordableOnly) l = l.filter((p) => canPick(p));
    if (q) l = l.filter((p) => p.fullName.toLowerCase().includes(q));
    const key =
      sort === 'priceAsc' ? (p: PoolPlayer) => -p.priceCents
      : sort === 'proj' ? (p: PoolPlayer) => p.projPoints
      : (p: PoolPlayer) => p.priceCents; // priceDesc (default)
    return [...l].sort((a, b) => key(b) - key(a));
  }, [players, pos, search, sort, chosen, affordableOnly, canPick, team]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div className="mt-auto flex h-[88vh] flex-col rounded-t-2xl bg-white dark:bg-[#1e1e1e] sm:mx-auto sm:mt-16 sm:mb-auto sm:h-[80vh] sm:w-full sm:max-w-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="min-w-0 truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
            {mode === 'trade' ? t('replace', { name: dropName ?? '' }) : t('chooseTitle', { pos: tPos(pos) })}{' '}
            <span className="text-gray-400">{counts[pos]}/{need[pos]} · {fmtMoney(remaining, locale)} {t('left')}</span>
          </h3>
          <button onClick={onClose} className="ml-2 shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900">{t('done')}</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('searchPlaceholder')}
            className="min-w-[120px] flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-[#252525]" />
          <select value={team} onChange={(e) => setTeam(e.target.value)} aria-label={t('teamFilter')}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-[#252525]">
            <option value="">{t('allTeams')}</option>
            {teamOptions.map((abbrev) => (
              <option key={abbrev} value={abbrev}>{abbrev}</option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-[#252525]">
            <option value="priceDesc">{t('sortPriceDesc')}</option>
            <option value="priceAsc">{t('sortPriceAsc')}</option>
            <option value="proj">{t('sortProj')}</option>
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={affordableOnly} onChange={(e) => setAffordableOnly(e.target.checked)} className="rounded border-gray-300" />
            {t('affordableOnly')}
          </label>
        </div>
        <div className="min-h-0 flex-1">
          <Virtuoso
            data={list}
            itemContent={(_i, p) => {
              const pickable = canPick(p) && !busy;
              const actionLabel = mode === 'trade' ? t('trade') : t('add');
              return (
                <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-2 dark:border-gray-800">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{p.fullName}</div>
                    <div className="text-xs text-gray-500" title={t('lastSeasonHint')}>{p.teamAbbrev ?? '—'} · {p.projPoints.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA', { maximumFractionDigits: 0 })} {t('ptsShort')}</div>
                  </div>
                  <div className="w-20 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtMoney(p.priceCents, locale)}</div>
                  {pickable ? (
                    <button onClick={() => onPick(p)} className="w-20 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-900">{actionLabel}</button>
                  ) : (
                    <span className="w-20 text-center text-xs font-medium text-gray-400">
                      {mode === 'add' && counts[p.position] >= need[p.position] ? t('full') : p.priceCents > remaining ? t('tooExpensive') : '—'}
                    </span>
                  )}
                </div>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Team picker modal (season stats, no price, no logo) ────────────────────
// The pick is free (00114), so there is nothing to sort by price and nothing
// to price out of reach: every club is always available.
function TeamPicker({
  teams, selected, onSelect, onClose,
}: {
  teams: NhlTeamChoice[];
  selected: string | null;
  onSelect: (abbrev: string | null) => void;
  onClose: () => void;
}) {
  const t = useTranslations('pool.composer');
  const locale = useLocale();
  const [sort, setSort] = useState<'name' | 'points'>('name');
  const list = useMemo(() => {
    const key = sort === 'points' ? (tm: NhlTeamChoice) => tm.teamPoints : null;
    const l = [...teams];
    return key ? l.sort((a, b) => key(b) - key(a)) : l.sort((a, b) => a.name.localeCompare(b.name));
  }, [teams, sort]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={onClose}>
      <div className="mt-auto flex h-[88vh] flex-col rounded-t-2xl bg-white dark:bg-[#1e1e1e] sm:mx-auto sm:mt-16 sm:mb-auto sm:h-[80vh] sm:w-full sm:max-w-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t('chooseTeamTitle')} <span className="text-gray-400">{t('teamFree')}</span>
          </h3>
          <button onClick={onClose} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900">{t('done')}</button>
        </div>
        <div className="flex items-center gap-2 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-[#252525]">
            <option value="name">{t('sortName')}</option>
            <option value="points">{t('sortPoints')}</option>
          </select>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.map((tm) => {
            const isSel = selected === tm.abbrev;
            return (
              <div key={tm.abbrev} className="flex items-center gap-3 border-b border-gray-100 px-4 py-2 dark:border-gray-800">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{tm.name}</div>
                  <div className="text-xs tabular-nums text-gray-500">
                    {tm.gp} {t('statGp')} · {tm.wins}-{tm.losses} · {t('statFor')} {tm.gf} / {t('statAgainst')} {tm.ga} · {tm.teamPoints.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA', { maximumFractionDigits: 0 })} {t('ptsShort')}
                  </div>
                </div>
                {isSel ? (
                  <button onClick={() => onSelect(null)} className="w-20 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">{t('remove')}</button>
                ) : (
                  <button onClick={() => onSelect(tm.abbrev)} className="w-20 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900">{t('choose')}</button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
