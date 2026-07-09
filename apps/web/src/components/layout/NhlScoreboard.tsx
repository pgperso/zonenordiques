'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from '@/i18n/navigation';

interface TeamScore {
  abbrev: string;
  score: number | null;
  logo: string | null;
}
interface Game {
  id: number;
  state: string; // FUT | PRE | LIVE | CRIT | FINAL | OFF
  startTimeUTC: string | null;
  period: number | null;
  periodType: string | null;
  clock: string | null;
  inIntermission: boolean;
  away: TeamScore;
  home: TeamScore;
}

// Height of the strip; also fed into --chrome-h so the fixed-height pages
// (chat, mètres, article/podcast views) subtract it too.
const STRIP_H = 52;

function todayET(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function shiftDate(d: string, days: number): string {
  const [y, m, day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const isLive = (s: string) => s === 'LIVE' || s === 'CRIT';
const isFinal = (s: string) => s === 'FINAL' || s === 'OFF';

export function NhlScoreboard() {
  const locale = useLocale();
  const isFr = locale === 'fr';
  const [date, setDate] = useState<string | null>(null);
  const [games, setGames] = useState<Game[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [seasonStart, setSeasonStart] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Open the native calendar when the date label is clicked.
  const openDatePicker = useCallback(() => {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        /* fall through to focus */
      }
    }
    el.focus();
  }, []);

  // Resolve "today" on the client only, to avoid an SSR/CSR date mismatch.
  useEffect(() => {
    setDate(todayET());
  }, []);

  // Season start/end — used to show a "season starts on…" message off-season.
  useEffect(() => {
    fetch('/api/nhl/season')
      .then((r) => r.json())
      .then((d: { start?: string | null }) => setSeasonStart(d.start ?? null))
      .catch(() => {});
  }, []);

  const fetchScores = useCallback(async (d: string) => {
    try {
      const res = await fetch(`/api/nhl/scoreboard?date=${d}`);
      const data = (await res.json()) as { games?: Game[] };
      setGames(data.games ?? []);
    } catch {
      setGames([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (date) fetchScores(date);
  }, [date, fetchScores]);

  // Live polling: refresh every 45s while a game is in progress and the tab
  // is visible.
  useEffect(() => {
    if (!date || !games?.some((g) => isLive(g.state))) return;
    const id = setInterval(() => {
      if (!document.hidden) fetchScores(date);
    }, 45000);
    return () => clearInterval(id);
  }, [games, date, fetchScores]);

  const hasGames = (games?.length ?? 0) > 0;
  const show = loaded && !!date;

  // Tell the fixed-height pages how tall the top chrome is while the strip is
  // visible; fall back to the header-only 4rem before first load.
  useEffect(() => {
    const root = document.documentElement;
    if (show) root.style.setProperty('--chrome-h', `calc(4rem + ${STRIP_H}px)`);
    else root.style.removeProperty('--chrome-h');
    return () => {
      root.style.removeProperty('--chrome-h');
    };
  }, [show]);

  // Hold layout until the first load resolves (avoids a flash before we know
  // whether there are games).
  if (!show) return null;

  const today = todayET();
  const dateLabel =
    date === today
      ? isFr ? "Aujourd'hui" : 'Today'
      : date === shiftDate(today, -1)
        ? isFr ? 'Hier' : 'Yesterday'
        : date === shiftDate(today, 1)
          ? isFr ? 'Demain' : 'Tomorrow'
          : new Date(`${date}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  // Empty-state copy: before the season opens, announce the start date;
  // otherwise it's simply a day with no games.
  const seasonStarted = seasonStart ? today >= seasonStart : true;
  const emptyMessage =
    !seasonStarted && seasonStart
      ? isFr
        ? `La nouvelle saison de la LNH débute le ${new Date(`${seasonStart}T12:00:00`).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })}`
        : `The new NHL season starts ${new Date(`${seasonStart}T12:00:00`).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}`
      : date === today
        ? isFr ? "Aucun match dans la LNH aujourd'hui" : 'No NHL games today'
        : isFr ? 'Aucun match ce jour' : 'No games this day';

  return (
    <div
      className="shrink-0 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-[#1e1e1e]"
      style={{ height: STRIP_H }}
    >
      <div className="mx-auto flex h-full max-w-7xl items-stretch">
        {/* Date navigation */}
        <div className="relative flex shrink-0 items-center gap-0.5 border-r border-gray-200 px-1 dark:border-gray-800">
          <button
            onClick={() => setDate((d) => (d ? shiftDate(d, -1) : d))}
            aria-label={isFr ? 'Jour précédent' : 'Previous day'}
            className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-gray-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={openDatePicker}
            aria-label={isFr ? 'Choisir une date' : 'Pick a date'}
            className="w-24 whitespace-nowrap rounded px-1 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500 transition hover:text-brand-blue dark:text-gray-400"
          >
            {dateLabel}
          </button>
          {/* Native date picker, visually hidden behind the label button. */}
          <input
            ref={dateInputRef}
            type="date"
            value={date ?? ''}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-1/2 h-0 w-0 -translate-x-1/2 opacity-0"
          />
          <button
            onClick={() => setDate((d) => (d ? shiftDate(d, 1) : d))}
            aria-label={isFr ? 'Jour suivant' : 'Next day'}
            className="rounded p-1 text-gray-400 transition hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-gray-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Games */}
        <div className="scrollbar-none flex flex-1 items-center gap-2 overflow-x-auto px-2">
          {hasGames ? (
            games!.map((g) => <GameChip key={g.id} game={g} locale={locale} isFr={isFr} />)
          ) : (
            <span className="whitespace-nowrap px-1 text-xs text-gray-400">
              {emptyMessage}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function statusLabel(g: Game, locale: string, isFr: boolean): { text: string; live: boolean } {
  if (isLive(g.state)) {
    if (g.inIntermission) return { text: isFr ? 'Entracte' : 'INT', live: true };
    const per =
      g.periodType === 'OT' ? 'PROL.' : g.periodType === 'SO' ? (isFr ? 'T.B.' : 'SO') : `P${g.period ?? ''}`;
    return { text: g.clock ? `${per} ${g.clock}` : per, live: true };
  }
  if (isFinal(g.state)) {
    const suffix = g.periodType === 'OT' ? ' (PROL.)' : g.periodType === 'SO' ? (isFr ? ' (T.B.)' : ' (SO)') : '';
    return { text: (isFr ? 'Final' : 'Final') + suffix, live: false };
  }
  // Scheduled — show local start time.
  const t = g.startTimeUTC
    ? new Date(g.startTimeUTC).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : '';
  return { text: t, live: false };
}

function GameChip({ game, locale, isFr }: { game: Game; locale: string; isFr: boolean }) {
  const status = statusLabel(game, locale, isFr);
  const started = isLive(game.state) || isFinal(game.state);

  return (
    <Link
      href={`/lnh/match/${game.id}`}
      className="flex h-9 shrink-0 items-center gap-2 rounded-lg border border-gray-200 px-2 transition hover:border-brand-blue hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
    >
      <div className="flex flex-col justify-center gap-0.5">
        <TeamRow team={game.away} showScore={started} />
        <TeamRow team={game.home} showScore={started} />
      </div>
      <div className="flex w-11 flex-col items-center justify-center">
        <span
          className={`text-[10px] font-bold leading-tight ${
            status.live ? 'text-brand-red' : 'text-gray-400'
          }`}
        >
          {status.text}
        </span>
      </div>
    </Link>
  );
}

function TeamRow({ team, showScore }: { team: TeamScore; showScore: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {team.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo} alt="" width={14} height={14} className="h-3.5 w-3.5 object-contain" loading="lazy" />
      )}
      <span className="w-8 text-[11px] font-semibold text-gray-700 dark:text-gray-200">{team.abbrev}</span>
      {showScore && (
        <span className="w-4 text-right text-[11px] font-bold tabular-nums text-gray-900 dark:text-gray-100">
          {team.score ?? 0}
        </span>
      )}
    </div>
  );
}
