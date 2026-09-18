import { NextResponse } from 'next/server';

// Official MLB Stats API. Public, no key (same source the MLB apps use).
const STATS_API = 'https://statsapi.mlb.com/api/v1';

interface MlbTeamSide {
  team?: { id?: number; abbreviation?: string; name?: string };
  score?: number;
}
interface MlbGame {
  gamePk?: number;
  gameDate?: string;
  status?: { abstractGameState?: string; detailedState?: string };
  teams?: { away?: MlbTeamSide; home?: MlbTeamSide };
  linescore?: { currentInning?: number; inningState?: string; currentInningOrdinal?: string };
}

function todayET(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Normalize the MLB "abstract" state to the same vocabulary the scoreboard
// component reasons about: FUT (scheduled) | LIVE | FINAL.
function normalizeState(abstract?: string): string {
  if (abstract === 'Live') return 'LIVE';
  if (abstract === 'Final') return 'FINAL';
  return 'FUT';
}

function side(t: MlbTeamSide | undefined) {
  const id = t?.team?.id ?? null;
  return {
    abbrev: t?.team?.abbreviation ?? '',
    score: typeof t?.score === 'number' ? t.score : null,
    logo: id != null ? `https://www.mlbstatic.com/team-logos/${id}.svg` : null,
  };
}

/**
 * Normalized MLB scores for a given day. `?date=YYYY-MM-DD` (defaults to the
 * America/Toronto day). Cached ~30s so live polling stays cheap and within
 * rate. Shape mirrors /api/nhl/scoreboard, with baseball-specific inning
 * fields instead of period/clock.
 */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('date');
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : todayET();

  try {
    const res = await fetch(
      `${STATS_API}/schedule?sportId=1&date=${date}&hydrate=linescore,team`,
      { next: { revalidate: 30 }, headers: { accept: 'application/json' } },
    );
    if (!res.ok) return NextResponse.json({ date, games: [] });
    const data = (await res.json()) as { dates?: { games?: MlbGame[] }[] };
    const raw = data.dates?.[0]?.games ?? [];

    const games = raw.map((g) => ({
      id: g.gamePk ?? 0,
      state: normalizeState(g.status?.abstractGameState),
      detail: g.status?.detailedState ?? null, // "Postponed", "Warmup", etc.
      startTimeUTC: g.gameDate ?? null,
      inning: g.linescore?.currentInning ?? null,
      inningState: g.linescore?.inningState ?? null, // Top | Middle | Bottom | End
      inningOrdinal: g.linescore?.currentInningOrdinal ?? null, // "5th"
      away: side(g.teams?.away),
      home: side(g.teams?.home),
    }));

    return NextResponse.json(
      { date, games },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    );
  } catch {
    return NextResponse.json({ date, games: [] });
  }
}
