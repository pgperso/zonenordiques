import { NextResponse } from 'next/server';

// Official MLB Stats API. Public, no key. One game's detail (header + linescore)
// for the scoreboard's popup. `?id=<gamePk>`. Cached ~30s for live refresh.
const STATS_API = 'https://statsapi.mlb.com/api/v1';

interface TeamSide {
  team?: { id?: number; abbreviation?: string; name?: string };
  score?: number;
}
interface InningLine {
  num?: number;
  home?: { runs?: number };
  away?: { runs?: number };
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
interface MlbGame {
  gameDate?: string;
  status?: { abstractGameState?: string; detailedState?: string };
  teams?: { away?: TeamSide; home?: TeamSide };
  linescore?: Linescore;
}

const logoUrl = (id?: number) =>
  id != null ? `https://www.mlbstatic.com/team-logos/${id}.svg` : null;

function normalizeState(abstract?: string): string {
  if (abstract === 'Live') return 'LIVE';
  if (abstract === 'Final') return 'FINAL';
  return 'FUT';
}

function side(t: TeamSide | undefined) {
  return {
    abbrev: t?.team?.abbreviation ?? '',
    name: t?.team?.name ?? '',
    score: typeof t?.score === 'number' ? t.score : null,
    logo: logoUrl(t?.team?.id),
  };
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `${STATS_API}/schedule?sportId=1&gamePk=${id}&hydrate=linescore,team`,
      { next: { revalidate: 30 }, headers: { accept: 'application/json' } },
    );
    if (!res.ok) return NextResponse.json({ game: null });
    const data = (await res.json()) as { dates?: { games?: MlbGame[] }[] };
    const g = data.dates?.[0]?.games?.[0];
    if (!g || !g.teams?.away || !g.teams?.home) return NextResponse.json({ game: null });

    const ls = g.linescore ?? {};
    const game = {
      id: Number(id),
      state: normalizeState(g.status?.abstractGameState),
      detail: g.status?.detailedState ?? null,
      startTimeUTC: g.gameDate ?? null,
      currentInning: ls.currentInning ?? null,
      inningState: ls.inningState ?? null,
      away: side(g.teams.away),
      home: side(g.teams.home),
      innings: (ls.innings ?? []).map((p) => ({
        num: p.num ?? 0,
        away: p.away?.runs ?? null,
        home: p.home?.runs ?? null,
      })),
      totals: {
        away: ls.teams?.away ?? { runs: 0, hits: 0, errors: 0 },
        home: ls.teams?.home ?? { runs: 0, hits: 0, errors: 0 },
      },
    };

    return NextResponse.json(
      { game },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    );
  } catch {
    return NextResponse.json({ game: null });
  }
}
