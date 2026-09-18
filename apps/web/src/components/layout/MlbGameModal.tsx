'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface TeamDetail {
  abbrev: string;
  name: string;
  score: number | null;
  logo: string | null;
}
interface Inning {
  num: number;
  away: number | null;
  home: number | null;
}
interface RHE {
  runs?: number;
  hits?: number;
  errors?: number;
}
interface GameDetail {
  id: number;
  state: string; // FUT | LIVE | FINAL
  detail: string | null;
  startTimeUTC: string | null;
  currentInning: number | null;
  inningState: string | null;
  away: TeamDetail;
  home: TeamDetail;
  innings: Inning[];
  totals: { away: RHE; home: RHE };
}

export function MlbGameModal({
  gameId,
  locale,
  isFr,
  onClose,
}: {
  gameId: number;
  locale: string;
  isFr: boolean;
  onClose: () => void;
}) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Fetch the game detail when opened.
  useEffect(() => {
    let alive = true;
    setLoaded(false);
    fetch(`/api/mlb/game?id=${gameId}`)
      .then((r) => r.json())
      .then((d: { game?: GameDetail | null }) => {
        if (alive) setGame(d.game ?? null);
      })
      .catch(() => {
        if (alive) setGame(null);
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [gameId]);

  const started = game?.state === 'LIVE' || game?.state === 'FINAL';
  const isFinalState = game?.state === 'FINAL';

  let statusText = '';
  if (game) {
    if (game.detail && /postpon|suspend|delay|reprogramm/i.test(game.detail)) {
      statusText = isFr ? 'Reporté' : 'Postponed';
    } else if (isFinalState) {
      const inn = game.currentInning ?? game.innings.length;
      statusText = (isFr ? 'Final' : 'Final') + (inn > 9 ? ` (${inn})` : '');
    } else if (game.state === 'LIVE') {
      const inn = isFr && game.currentInning != null ? `${game.currentInning}e` : (game.innings[game.innings.length - 1]?.num ? `${game.innings[game.innings.length - 1].num}` : '');
      const half = game.inningState ? `${game.inningState} ` : '';
      statusText = `${half}${inn}`.trim();
    } else if (game.startTimeUTC) {
      statusText = new Date(game.startTimeUTC).toLocaleString(locale, {
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-[#1e1e1e]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label={isFr ? 'Fermer' : 'Close'}
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
        >
          <X className="h-5 w-5" />
        </button>

        {!loaded ? (
          <div className="flex h-40 items-center justify-center text-sm text-gray-400">
            {isFr ? 'Chargement…' : 'Loading…'}
          </div>
        ) : !game ? (
          <div className="flex h-40 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            {isFr ? 'Match indisponible.' : 'Game unavailable.'}
          </div>
        ) : (
          <>
            {/* Header */}
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-wide text-brand-red">
              {statusText}
            </p>
            <div className="flex items-center justify-center gap-6">
              <TeamHead team={game.away} />
              <div className="flex items-center gap-3 text-4xl font-extrabold tabular-nums text-gray-900 dark:text-gray-100">
                <span>{started ? game.away.score ?? 0 : '–'}</span>
                <span className="text-gray-300 dark:text-gray-600">:</span>
                <span>{started ? game.home.score ?? 0 : '–'}</span>
              </div>
              <TeamHead team={game.home} />
            </div>

            {/* Linescore by inning + R/H/E */}
            {game.innings.length > 0 && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead>
                    <tr className="text-gray-400">
                      <th className="px-2 py-1 text-left font-medium"></th>
                      {game.innings.map((p) => (
                        <th key={p.num} className="px-2 py-1 text-center font-medium">{p.num}</th>
                      ))}
                      <th className="px-2 py-1 text-center font-bold">R</th>
                      <th className="px-2 py-1 text-center font-medium">H</th>
                      <th className="px-2 py-1 text-center font-medium">E</th>
                    </tr>
                  </thead>
                  <tbody>
                    <LineRow label={game.away.abbrev} innings={game.innings} totals={game.totals.away} side="away" />
                    <LineRow label={game.home.abbrev} innings={game.innings} totals={game.totals.home} side="home" />
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TeamHead({ team }: { team: TeamDetail }) {
  return (
    <div className="flex w-24 flex-col items-center gap-1 text-center">
      {team.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo} alt="" width={40} height={40} className="h-10 w-10 object-contain" />
      )}
      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{team.abbrev}</span>
      <span className="line-clamp-1 text-[11px] text-gray-400">{team.name}</span>
    </div>
  );
}

function LineRow({
  label,
  innings,
  totals,
  side,
}: {
  label: string;
  innings: Inning[];
  totals: RHE;
  side: 'away' | 'home';
}) {
  return (
    <tr className="border-t border-gray-100 dark:border-gray-800">
      <td className="px-2 py-1.5 text-left font-bold text-gray-900 dark:text-gray-100">{label}</td>
      {innings.map((p) => (
        <td key={p.num} className="px-2 py-1.5 text-center tabular-nums text-gray-700 dark:text-gray-300">
          {p[side] ?? ''}
        </td>
      ))}
      <td className="px-2 py-1.5 text-center font-bold tabular-nums text-gray-900 dark:text-gray-100">{totals.runs ?? 0}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-gray-400">{totals.hits ?? 0}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-gray-400">{totals.errors ?? 0}</td>
    </tr>
  );
}
