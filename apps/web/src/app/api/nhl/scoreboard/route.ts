import { NextResponse } from 'next/server';

// Official NHL web API (same host nhlService uses). Public, no key.
const WEB_API = 'https://api-web.nhle.com/v1';

interface NhlTeam {
  abbrev?: string;
  score?: number;
  logo?: string;
}
interface NhlGame {
  id: number;
  gameState?: string;
  startTimeUTC?: string;
  periodDescriptor?: { number?: number; periodType?: string };
  clock?: { timeRemaining?: string; inIntermission?: boolean };
  awayTeam?: NhlTeam;
  homeTeam?: NhlTeam;
}

function team(t: NhlTeam | undefined) {
  return { abbrev: t?.abbrev ?? '', score: t?.score ?? null, logo: t?.logo ?? null };
}

/**
 * Normalized NHL scores for a given day. `?date=YYYY-MM-DD` (defaults to the
 * NHL "now" day). Cached ~30s so live polling stays cheap and within rate.
 */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get('date');
  const path = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `/score/${date}` : '/score/now';

  try {
    const res = await fetch(`${WEB_API}${path}`, {
      next: { revalidate: 30 },
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return NextResponse.json({ date: date ?? null, games: [] });
    const data = (await res.json()) as { currentDate?: string; games?: NhlGame[] };

    const games = (data.games ?? []).map((g) => ({
      id: g.id,
      state: g.gameState ?? 'FUT', // FUT | PRE | LIVE | CRIT | FINAL | OFF
      startTimeUTC: g.startTimeUTC ?? null,
      period: g.periodDescriptor?.number ?? null,
      periodType: g.periodDescriptor?.periodType ?? null,
      clock: g.clock?.timeRemaining ?? null,
      inIntermission: g.clock?.inIntermission ?? false,
      away: team(g.awayTeam),
      home: team(g.homeTeam),
    }));

    return NextResponse.json(
      { date: data.currentDate ?? date ?? null, games },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    );
  } catch {
    return NextResponse.json({ date: date ?? null, games: [] });
  }
}
