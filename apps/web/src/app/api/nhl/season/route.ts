import { NextResponse } from 'next/server';

const WEB_API = 'https://api-web.nhle.com/v1';

/**
 * Regular-season start/end dates (YYYY-MM-DD) from the NHL schedule. In the
 * offseason the API already rolls these to the upcoming season, so the strip
 * can show "next season starts on…". Cached 6h — it changes rarely.
 */
export async function GET() {
  try {
    const res = await fetch(`${WEB_API}/schedule/now`, {
      next: { revalidate: 21600 },
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return NextResponse.json({ start: null, end: null });
    const data = (await res.json()) as { regularSeasonStartDate?: string; regularSeasonEndDate?: string };
    return NextResponse.json(
      { start: data.regularSeasonStartDate ?? null, end: data.regularSeasonEndDate ?? null },
      { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' } },
    );
  } catch {
    return NextResponse.json({ start: null, end: null });
  }
}
