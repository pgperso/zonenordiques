import { NextResponse } from 'next/server';

const STATS_API = 'https://statsapi.mlb.com/api/v1';

interface MlbSeason {
  regularSeasonStartDate?: string;
  regularSeasonEndDate?: string;
  seasonEndDate?: string; // includes the postseason
}

function todayET(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function fetchSeason(year: number): Promise<MlbSeason | null> {
  const res = await fetch(`${STATS_API}/seasons?sportId=1&season=${year}`, {
    next: { revalidate: 21600 },
    headers: { accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { seasons?: MlbSeason[] };
  return data.seasons?.[0] ?? null;
}

/**
 * Regular-season start (and postseason end) dates for the RELEVANT MLB season,
 * as YYYY-MM-DD. Once the current season's postseason is over we roll to next
 * year, so the strip can show "next season starts on…" all winter. Cached 6h.
 * Same response shape as /api/nhl/season.
 */
export async function GET() {
  try {
    const today = todayET();
    const year = Number(today.slice(0, 4));
    let season = await fetchSeason(year);

    // Deep off-season: past this year's postseason → point at next season.
    if (season?.seasonEndDate && today > season.seasonEndDate) {
      season = (await fetchSeason(year + 1)) ?? season;
    }

    return NextResponse.json(
      { start: season?.regularSeasonStartDate ?? null, end: season?.seasonEndDate ?? null },
      { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } },
    );
  } catch {
    return NextResponse.json({ start: null, end: null });
  }
}
