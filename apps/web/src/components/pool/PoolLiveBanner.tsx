'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * Tonight's pool leaderboard, in the chat.
 *
 * Collapsed it is a floating button, so it never stands between a member and
 * the conversation — the chat is the reason they are on the page. The choice
 * is remembered per device: someone who closes it should not have to close it
 * again on every visit.
 *
 * It polls only while it is open AND the tab is visible. A backgrounded tab
 * polling all evening would be pure waste, and ad impressions from a tab
 * nobody is looking at are not impressions at all.
 */
const STORAGE_KEY = 'pool-live-banner-open';
const POLL_MS = 60_000;

interface Row {
  entryId: number;
  teamName: string;
  teamLogo: string | null;
  pointsToday: number;
  rankToday: number;
  pointsTotal: number;
  rankTotal: number;
}

interface Payload {
  rows: Row[];
  gameDay: string | null;
  gamesLive: number;
  gamesTotal: number;
}

function fmtPts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function PoolLiveBanner() {
  const t = useTranslations('pool.live');
  const [open, setOpen] = useState<boolean | null>(null); // null = not yet read
  const [data, setData] = useState<Payload | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read the preference after mount: localStorage is not available during SSR
  // and a mismatch would flash the wrong state.
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(STORAGE_KEY) !== '0');
    } catch {
      setOpen(true); // private browsing: default to showing it
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pool/live');
      if (!res.ok) return;
      setData((await res.json()) as Payload);
    } catch {
      // Keep whatever is on screen; a dropped poll is not worth an error state.
    }
  }, []);

  useEffect(() => {
    if (open !== true) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState === 'visible') await load();
      if (!cancelled) timer.current = setTimeout(tick, POLL_MS);
    };
    void tick();

    // Catch up immediately when the member comes back to the tab, instead of
    // showing them numbers that stopped when they left.
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [open, load]);

  function choose(next: boolean) {
    setOpen(next);
    try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0'); } catch { /* private browsing */ }
  }

  // Stay invisible until there is genuinely something to show: while the
  // preference is still unknown, while the first fetch is in flight, and all
  // season long before the first puck drop. Rendering a "loading" frame that
  // then vanishes on an empty answer is a flash of furniture for nothing —
  // and before the season that would be every single page load.
  if (open === null || data === null || data.rows.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => choose(true)}
        aria-label={t('expand')}
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:bg-gray-800 dark:bg-white dark:text-gray-900"
      >
        {data.gamesLive > 0 && (
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        )}
        {t('buttonLabel')}
        <span className="tabular-nums opacity-70">{fmtPts(data.rows[0].pointsToday)}</span>
      </button>
    );
  }

  const top = data.rows.slice(0, 5);

  return (
    <section
      aria-label={t('title')}
      className="mx-4 mt-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-[#252525]"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {data.gamesLive > 0 ? (
            <span className="flex items-center gap-1.5 text-red-600">
              <span className="relative flex h-2 w-2" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
              </span>
              {t('liveNow', { count: data.gamesLive })}
            </span>
          ) : (
            t('title')
          )}
        </h2>
        <button
          type="button"
          onClick={() => choose(false)}
          aria-label={t('collapse')}
          className="rounded px-1.5 text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-200"
        >
          ✕
        </button>
      </div>

      <ol className="mt-2 space-y-1">
        {top.map((r) => (
          <li key={r.entryId} className="flex items-baseline gap-2 text-sm">
            <span className="w-5 shrink-0 tabular-nums text-gray-400">{r.rankToday}</span>
            <Link
              href={`/lnh/pool/equipe/${r.entryId}`}
              className="min-w-0 flex-1 truncate text-gray-900 hover:underline dark:text-gray-100"
            >
              {r.teamName}
            </Link>
            <span className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-gray-100">
              {fmtPts(r.pointsToday)}
            </span>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-gray-400">
              {t('overall', { rank: r.rankTotal })}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
        <span>{data.gameDay ?? ''}</span>
        <Link href="/lnh/pool/classement" className="hover:text-gray-600 hover:underline dark:hover:text-gray-300">
          {t('fullStandings')}
        </Link>
      </div>
    </section>
  );
}
