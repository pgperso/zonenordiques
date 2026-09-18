import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BRAND } from '@/lib/brand';
import { AdSlot } from '@/components/ads/AdSlot';

const STATS_API = 'https://statsapi.mlb.com/api/v1';

// Scores change during a game; refresh often. Kept out of the index (ephemeral
// + duplicative of the official source).
export const revalidate = 30;

interface TeamSide {
  team?: { id?: number; abbreviation?: string; name?: string };
  score?: number;
}
interface InningLine {
  num?: number;
  ordinalNum?: string;
  home?: { runs?: number; hits?: number; errors?: number };
  away?: { runs?: number; hits?: number; errors?: number };
}
interface Linescore {
  innings?: InningLine[];
  currentInning?: number;
  inningState?: string;
  teams?: {
    home?: { runs?: number; hits?: number; errors?: number };
    away?: { runs?: number; hits?: number; errors?: number };
  };
}
interface Game {
  gamePk?: number;
  gameDate?: string;
  status?: { abstractGameState?: string; detailedState?: string };
  teams?: { away?: TeamSide; home?: TeamSide };
  linescore?: Linescore;
}

async function getGame(id: string): Promise<Game | null> {
  try {
    const res = await fetch(
      `${STATS_API}/schedule?sportId=1&gamePk=${id}&hydrate=linescore,team`,
      { next: { revalidate: 30 }, headers: { accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { dates?: { games?: Game[] }[] };
    return data.dates?.[0]?.games?.[0] ?? null;
  } catch {
    return null;
  }
}

const logoUrl = (id?: number) =>
  id != null ? `https://www.mlbstatic.com/team-logos/${id}.svg` : null;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const g = await getGame(id);
  const isFr = locale === 'fr';
  const away = g?.teams?.away?.team?.abbreviation ?? '';
  const home = g?.teams?.home?.team?.abbreviation ?? '';
  const title = away && home
    ? `${away} @ ${home} — ${isFr ? 'sommaire du match' : 'game summary'} | ${BRAND.name}`
    : `${isFr ? 'Sommaire du match' : 'Game summary'} | ${BRAND.name}`;
  return { title, robots: { index: false, follow: true } };
}

export default async function MlbMatchPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const isFr = locale === 'fr';
  const g = await getGame(id);

  if (!g || !g.teams?.away || !g.teams?.home) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="mb-6 text-gray-600 dark:text-gray-400">
          {isFr ? 'Match introuvable ou indisponible.' : 'Game not found or unavailable.'}
        </p>
        <Link href="/" className="text-sm font-semibold text-brand-blue hover:underline">
          {isFr ? "Retour à l'accueil" : 'Back to home'}
        </Link>
      </div>
    );
  }

  const away = g.teams.away;
  const home = g.teams.home;
  const abstract = g.status?.abstractGameState;
  const started = abstract === 'Live' || abstract === 'Final';
  const isFinalState = abstract === 'Final';
  const ls = g.linescore ?? {};
  const innings = ls.innings ?? [];

  let statusText = '';
  if (isFinalState) {
    const extra = (ls.currentInning ?? innings.length) > 9 ? ` (${ls.currentInning ?? innings.length})` : '';
    statusText = (isFr ? 'Final' : 'Final') + extra;
  } else if (abstract === 'Live') {
    const inn = isFr && ls.currentInning != null ? `${ls.currentInning}e` : (innings[innings.length - 1]?.ordinalNum ?? '');
    const half = ls.inningState ? `${ls.inningState} ` : '';
    statusText = `${half}${inn}`.trim();
  } else if (g.gameDate) {
    statusText = new Date(g.gameDate).toLocaleString(locale, {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const totals = ls.teams ?? {};

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6">
      <Link href="/" className="mb-4 inline-block text-sm text-gray-500 hover:text-brand-blue dark:text-gray-400">
        ← {isFr ? 'Accueil' : 'Home'}
      </Link>

      {/* Scoreboard header */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-[#1e1e1e]">
        <p className="mb-3 text-center text-xs font-bold uppercase tracking-wide text-brand-red">
          {statusText}
        </p>
        <div className="flex items-center justify-center gap-6">
          <TeamHead team={away} />
          <div className="flex items-center gap-3 text-4xl font-extrabold tabular-nums text-gray-900 dark:text-gray-100">
            <span>{started ? away.score ?? 0 : '–'}</span>
            <span className="text-gray-300 dark:text-gray-600">:</span>
            <span>{started ? home.score ?? 0 : '–'}</span>
          </div>
          <TeamHead team={home} />
        </div>
      </div>

      {/* Linescore by inning + R/H/E */}
      {innings.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-sm">
            <thead>
              <tr className="text-gray-400">
                <th className="px-2 py-1 text-left font-medium"></th>
                {innings.map((p) => (
                  <th key={p.num} className="px-2 py-1 text-center font-medium">{p.num}</th>
                ))}
                <th className="px-2 py-1 text-center font-bold">R</th>
                <th className="px-2 py-1 text-center font-medium">H</th>
                <th className="px-2 py-1 text-center font-medium">E</th>
              </tr>
            </thead>
            <tbody>
              <LineRow label={away.team?.abbreviation ?? ''} innings={innings} totals={totals.away} side="away" />
              <LineRow label={home.team?.abbreviation ?? ''} innings={innings} totals={totals.home} side="home" />
            </tbody>
          </table>
        </div>
      )}

      <AdSlot slotId="home-mid-banner" format="leaderboard" className="mx-auto mt-8" />
    </div>
  );
}

function TeamHead({ team }: { team: TeamSide }) {
  const logo = logoUrl(team.team?.id);
  return (
    <div className="flex w-24 flex-col items-center gap-1 text-center">
      {logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" width={40} height={40} className="h-10 w-10 object-contain" />
      )}
      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{team.team?.abbreviation}</span>
      <span className="line-clamp-1 text-[11px] text-gray-400">{team.team?.name}</span>
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
  innings: InningLine[];
  totals?: { runs?: number; hits?: number; errors?: number };
  side: 'away' | 'home';
}) {
  return (
    <tr className="border-t border-gray-100 dark:border-gray-800">
      <td className="px-2 py-1.5 text-left font-bold text-gray-900 dark:text-gray-100">{label}</td>
      {innings.map((p) => (
        <td key={p.num} className="px-2 py-1.5 text-center tabular-nums text-gray-700 dark:text-gray-300">
          {p[side]?.runs ?? ''}
        </td>
      ))}
      <td className="px-2 py-1.5 text-center font-bold tabular-nums text-gray-900 dark:text-gray-100">{totals?.runs ?? 0}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-gray-400">{totals?.hits ?? 0}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-gray-400">{totals?.errors ?? 0}</td>
    </tr>
  );
}
