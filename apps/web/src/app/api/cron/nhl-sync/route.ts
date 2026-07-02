import { NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { syncDate } from '@/services/nhlService';
import { announcePoolLeader } from '@/services/botService';

// Boxscore fan-out over a full slate (up to ~16 games), each with retry
// backoff, can run long; give it headroom (Vercel Pro allows up to 300s).
export const maxDuration = 300;

/**
 * Authorize the caller: the Vercel cron (bearer CRON_SECRET) or an
 * authenticated global owner triggering a sync manually. Mirrors the
 * authorize() in /api/polls/rotate.
 */
async function authorize(request: Request): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: ownerRows } = await supabase
    .from('community_member_roles')
    .select('id, roles!inner(code)')
    .eq('member_id', user.id)
    .eq('roles.code', 'owner')
    .limit(1);
  return Boolean((ownerRows as unknown[] | null)?.length);
}

/**
 * Nightly NHL ingestion. Runs after games finish (early morning ET), pulls
 * the previous slate's boxscores, and upserts per-player stats. The pool
 * recompute (migration 00055) reads from these tables afterwards.
 *
 * Accepts an optional ?date=YYYY-MM-DD to backfill a specific day; defaults
 * to "now" (the NHL API resolves that to the current slate's date).
 */
async function handleSync(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Configuration Supabase manquante' }, { status: 500 });
  }
  const admin = createServiceClient(supabaseUrl, serviceKey);

  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? 'now';

  // Open a run-log row so a silent failure is visible after the fact.
  const { data: runRow } = await admin
    .from('nhl_sync_runs')
    .insert({ status: 'running', target_date: date === 'now' ? null : date })
    .select('id')
    .single();
  const runId = (runRow as { id: number } | null)?.id;

  try {
    const result = await syncDate(admin, date);

    // Recompute pool standings from the freshly-synced stats. Idempotent —
    // a pure REPLACE, so re-running never double-counts.
    const { data: season } = await admin
      .from('pool_seasons')
      .select('id')
      .order('nhl_season', { ascending: false })
      .limit(1)
      .maybeSingle();
    const seasonId = (season as { id: number } | null)?.id;
    if (seasonId) {
      await admin.rpc('pool_refresh_standings', { p_season_id: seasonId });

      // Daily-return hook: announce the leader in the LNH tribune, but only on
      // nights where games were actually scored (no spam on off-days).
      if (result.statRows > 0) {
        const { data: top } = await admin
          .from('pool_standings')
          .select('fantasy_points, pool_entries!inner(team_name)')
          .eq('season_id', seasonId)
          .eq('rank', 1)
          .limit(1)
          .maybeSingle();
        const leader = top as { fantasy_points: number; pool_entries: { team_name: string } } | null;
        if (leader) {
          const { data: lnh } = await admin.from('communities').select('id').eq('slug', 'lnh').single();
          const communityId = (lnh as { id: number } | null)?.id;
          if (communityId) {
            const pts = Number(leader.fantasy_points).toLocaleString('fr-CA', { maximumFractionDigits: 1 });
            await announcePoolLeader(admin, communityId, leader.pool_entries.team_name, pts).catch(() => {});
          }
        }
      }
    }

    if (runId) {
      await admin
        .from('nhl_sync_runs')
        .update({
          status: 'ok',
          finished_at: new Date().toISOString(),
          target_date: result.targetDate,
          games_seen: result.gamesSeen,
          games_finalized: result.gamesFinalized,
          stat_rows: result.statRows,
          // Surface partial failures without failing the whole run.
          error: result.failedGames.length ? `failed games: ${result.failedGames.join(', ')}` : null,
        })
        .eq('id', runId);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    if (runId) {
      await admin
        .from('nhl_sync_runs')
        .update({ status: 'error', finished_at: new Date().toISOString(), error: msg })
        .eq('id', runId);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export function GET(request: Request) {
  return handleSync(request);
}

export function POST(request: Request) {
  return handleSync(request);
}
