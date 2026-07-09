import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BRAND } from '@/lib/brand';
import { AdSlot } from '@/components/ads/AdSlot';

const WEB_API = 'https://api-web.nhle.com/v1';

// Scores change during a game; refresh often. Kept out of the index (ephemeral
// + duplicative of the official source).
export const revalidate = 30;

interface NameField { default?: string; fr?: string }
interface LandingTeam {
  abbrev?: string;
  name?: NameField;
  score?: number;
  sog?: number;
  logo?: string;
}
interface Goal {
  timeInPeriod?: string;
  strength?: string;
  teamAbbrev?: NameField;
  firstName?: NameField;
  lastName?: NameField;
  name?: NameField;
  awayScore?: number;
  homeScore?: number;
  assists?: { name?: NameField; firstName?: NameField; lastName?: NameField }[];
}
interface PeriodLine { periodDescriptor?: { number?: number; periodType?: string }; away?: number; home?: number }
interface Landing {
  id?: number;
  gameState?: string;
  gameDate?: string;
  awayTeam?: LandingTeam;
  homeTeam?: LandingTeam;
  periodDescriptor?: { number?: number; periodType?: string };
  clock?: { timeRemaining?: string; inIntermission?: boolean };
  summary?: {
    scoring?: { periodDescriptor?: { number?: number; periodType?: string }; goals?: Goal[] }[];
    linescore?: { byPeriod?: PeriodLine[]; totals?: { away?: number; home?: number } };
    shotsByPeriod?: PeriodLine[];
  };
}

async function getLanding(id: string): Promise<Landing | null> {
  try {
    const res = await fetch(`${WEB_API}/gamecenter/${id}/landing`, {
      next: { revalidate: 30 },
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as Landing;
  } catch {
    return null;
  }
}

const nm = (f: NameField | undefined, locale: string) =>
  (locale === 'fr' ? f?.fr ?? f?.default : f?.default) ?? '';

function periodLabel(n: number | undefined, type: string | undefined, isFr: boolean): string {
  if (type === 'OT') return isFr ? 'Prol.' : 'OT';
  if (type === 'SO') return isFr ? 'T.B.' : 'SO';
  return `${n ?? ''}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const g = await getLanding(id);
  const isFr = locale === 'fr';
  const away = g?.awayTeam?.abbrev ?? '';
  const home = g?.homeTeam?.abbrev ?? '';
  const title = away && home
    ? `${away} @ ${home} — ${isFr ? 'sommaire du match' : 'game summary'} | ${BRAND.name}`
    : `${isFr ? 'Sommaire du match' : 'Game summary'} | ${BRAND.name}`;
  return { title, robots: { index: false, follow: true } };
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const isFr = locale === 'fr';
  const g = await getLanding(id);

  if (!g || !g.awayTeam || !g.homeTeam) {
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

  const away = g.awayTeam;
  const home = g.homeTeam;
  const started = g.gameState === 'LIVE' || g.gameState === 'CRIT' || g.gameState === 'FINAL' || g.gameState === 'OFF';
  const isFinalState = g.gameState === 'FINAL' || g.gameState === 'OFF';
  const byPeriod = g.summary?.linescore?.byPeriod ?? [];
  const shots = g.summary?.shotsByPeriod ?? [];
  const scoring = g.summary?.scoring ?? [];

  const statusText = isFinalState
    ? isFr ? 'Final' : 'Final'
    : g.gameState === 'LIVE' || g.gameState === 'CRIT'
      ? g.clock?.inIntermission
        ? isFr ? 'Entracte' : 'Intermission'
        : `${periodLabel(g.periodDescriptor?.number, g.periodDescriptor?.periodType, isFr)} · ${g.clock?.timeRemaining ?? ''}`
      : g.gameDate
        ? new Date(g.gameDate).toLocaleDateString(locale, { day: 'numeric', month: 'long' })
        : '';

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
          <TeamHead team={away} locale={locale} />
          <div className="flex items-center gap-3 text-4xl font-extrabold tabular-nums text-gray-900 dark:text-gray-100">
            <span>{started ? away.score ?? 0 : '–'}</span>
            <span className="text-gray-300 dark:text-gray-600">:</span>
            <span>{started ? home.score ?? 0 : '–'}</span>
          </div>
          <TeamHead team={home} locale={locale} />
        </div>
      </div>

      {/* Linescore */}
      {byPeriod.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[360px] border-collapse text-sm">
            <thead>
              <tr className="text-gray-400">
                <th className="px-2 py-1 text-left font-medium"></th>
                {byPeriod.map((p, i) => (
                  <th key={i} className="px-2 py-1 text-center font-medium">
                    {periodLabel(p.periodDescriptor?.number, p.periodDescriptor?.periodType, isFr)}
                  </th>
                ))}
                <th className="px-2 py-1 text-center font-bold">T</th>
                <th className="px-2 py-1 text-center font-medium">{isFr ? 'Tirs' : 'SOG'}</th>
              </tr>
            </thead>
            <tbody>
              <LineRow label={away.abbrev ?? ''} periods={byPeriod} shots={shots} total={away.score} sog={away.sog} side="away" />
              <LineRow label={home.abbrev ?? ''} periods={byPeriod} shots={shots} total={home.score} sog={home.sog} side="home" />
            </tbody>
          </table>
        </div>
      )}

      {/* Scoring summary */}
      {scoring.some((p) => (p.goals?.length ?? 0) > 0) && (
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {isFr ? 'Buts' : 'Scoring'}
          </h2>
          <div className="space-y-4">
            {scoring.map((per, i) => {
              const goals = per.goals ?? [];
              if (goals.length === 0) return null;
              return (
                <div key={i}>
                  <p className="mb-1 text-xs font-semibold text-gray-400">
                    {periodLabel(per.periodDescriptor?.number, per.periodDescriptor?.periodType, isFr)}
                    {per.periodDescriptor?.periodType === 'REG' || !per.periodDescriptor?.periodType
                      ? isFr ? 'ᵉ période' : ''
                      : ''}
                  </p>
                  <ul className="space-y-1.5">
                    {goals.map((goal, j) => {
                      const scorer = nm(goal.name, locale) || `${nm(goal.firstName, locale)} ${nm(goal.lastName, locale)}`.trim();
                      const team = nm(goal.teamAbbrev, locale);
                      const assists = (goal.assists ?? [])
                        .map((a) => nm(a.name, locale) || `${nm(a.firstName, locale)} ${nm(a.lastName, locale)}`.trim())
                        .filter(Boolean);
                      return (
                        <li key={j} className="flex items-baseline gap-2 text-sm">
                          <span className="w-10 shrink-0 tabular-nums text-gray-400">{goal.timeInPeriod ?? ''}</span>
                          <span className="w-9 shrink-0 font-bold text-brand-blue">{team}</span>
                          <span className="text-gray-900 dark:text-gray-100">
                            <span className="font-semibold">{scorer}</span>
                            {assists.length > 0 && (
                              <span className="text-gray-500 dark:text-gray-400"> ({assists.join(', ')})</span>
                            )}
                            {goal.strength && goal.strength !== 'ev' && (
                              <span className="ml-1 text-xs uppercase text-brand-red">{goal.strength}</span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <AdSlot slotId="home-mid-banner" format="leaderboard" className="mx-auto mt-8" />
    </div>
  );
}

function TeamHead({ team, locale }: { team: LandingTeam; locale: string }) {
  return (
    <div className="flex w-24 flex-col items-center gap-1 text-center">
      {team.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.logo} alt="" width={40} height={40} className="h-10 w-10 object-contain" />
      )}
      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{team.abbrev}</span>
      <span className="line-clamp-1 text-[11px] text-gray-400">{nm(team.name, locale)}</span>
    </div>
  );
}

function LineRow({
  label,
  periods,
  shots,
  total,
  sog,
  side,
}: {
  label: string;
  periods: PeriodLine[];
  shots: PeriodLine[];
  total?: number;
  sog?: number;
  side: 'away' | 'home';
}) {
  return (
    <tr className="border-t border-gray-100 dark:border-gray-800">
      <td className="px-2 py-1.5 text-left font-bold text-gray-900 dark:text-gray-100">{label}</td>
      {periods.map((p, i) => (
        <td key={i} className="px-2 py-1.5 text-center tabular-nums text-gray-700 dark:text-gray-300">
          {p[side] ?? 0}
        </td>
      ))}
      <td className="px-2 py-1.5 text-center font-bold tabular-nums text-gray-900 dark:text-gray-100">{total ?? 0}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-gray-400">
        {sog ?? shots.reduce((sum, p) => sum + (p[side] ?? 0), 0)}
      </td>
    </tr>
  );
}
