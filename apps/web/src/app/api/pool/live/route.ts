import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { SITE } from '@/lib/siteConfig';
import { syncDate } from '@/services/nhlService';

/** One slate is ~8 boxscores; the NHL API is rate-limited and retries. */
export const maxDuration = 60;

/**
 * Tonight's pool leaderboard, refreshed from the live NHL boxscores.
 *
 * Read-only and public: the standings are public (00071), and the banner sits
 * in a chat anyone can read. Nothing here trusts the caller.
 *
 * The refresh is on demand rather than on a cron. A cron every two minutes
 * would hammer the NHL API all season, including the hours nobody is watching
 * and the months with no games at all. Here the work happens only while
 * someone has the banner open, and the throttle below means a hundred viewers
 * cost exactly the same as one.
 */
const REFRESH_AFTER_MS = 90_000;

function service() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) return null;
  return createServiceClient(supabaseUrl, serviceKey);
}

export async function GET() {
  // The pool is hockey-only; route handlers are not covered by the segment
  // gate that 404s /lnh/pool on the other brands.
  if (!SITE.showPool || SITE.category !== 'hockey') {
    return NextResponse.json({ error: 'Pool indisponible sur ce site' }, { status: 404 });
  }

  const admin = service();
  if (!admin) return NextResponse.json({ error: 'Configuration Supabase manquante' }, { status: 500 });

  const db = admin as unknown as ReturnType<typeof createServiceClient>;

  const { data: seasonRow } = await db
    .from('pool_seasons')
    .select('id, nhl_season, status')
    .order('nhl_season', { ascending: false })
    .limit(1)
    .maybeSingle();
  const season = seasonRow as { id: number } | null;
  if (!season) return NextResponse.json({ rows: [], live: false, refreshedAt: null });

  // Is there anything in progress, and how long since we last read it? Both
  // answers come from nhl_games, so the throttle needs no extra table and no
  // shared memory — which a serverless deployment does not have anyway.
  const { data: liveRows } = await db
    .from('nhl_games')
    .select('game_id, last_synced_at')
    .in('game_state', ['LIVE', 'CRIT'])
    .order('last_synced_at', { ascending: true })
    .limit(1);
  const live = ((liveRows ?? []) as Array<{ last_synced_at: string | null }>)[0];

  let refreshed = false;
  if (live) {
    const age = Date.now() - new Date(live.last_synced_at ?? 0).getTime();
    if (age > REFRESH_AFTER_MS) {
      try {
        await syncDate(admin, 'now', { includeLive: true });
        // p_live: a live pass must not rotate previous_rank, or the ▲/▼
        // arrows against yesterday would reset every ninety seconds.
        await db.rpc('pool_refresh_standings' as never, {
          p_season_id: season.id, p_live: true,
        } as never);
        refreshed = true;
      } catch {
        // A flaky NHL API must not empty the banner: fall through and serve
        // the numbers we already have.
      }
    }
  }

  const { data, error } = await db.rpc('pool_live_standings' as never, {
    p_season_id: season.id,
  } as never);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = ((data ?? []) as Array<{
    entry_id: number; team_name: string; team_logo: string | null;
    points_today: number; rank_today: number; points_total: number; rank_total: number;
    game_day: string; games_live: number; games_total: number;
  }>).map((r) => ({
    entryId: Number(r.entry_id),
    teamName: r.team_name,
    teamLogo: r.team_logo,
    pointsToday: Number(r.points_today),
    rankToday: Number(r.rank_today),
    pointsTotal: Number(r.points_total),
    rankTotal: Number(r.rank_total),
  }));

  const first = (data as Array<{ game_day: string; games_live: number; games_total: number }> | null)?.[0];
  return NextResponse.json({
    rows,
    gameDay: first?.game_day ?? null,
    gamesLive: Number(first?.games_live ?? 0),
    gamesTotal: Number(first?.games_total ?? 0),
    refreshed,
  });
}
