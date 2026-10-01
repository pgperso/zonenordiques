import { NextResponse } from 'next/server';
import { SITE } from '@/lib/siteConfig';
import { isCronRequest, isSameOrigin, CROSS_SITE_REFUSED } from '@/lib/requestGuards';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { syncDate, type SyncResult } from '@/services/nhlService';
import { announcePoolLeader } from '@/services/botService';
import { postDailyPoolAnalysis } from '@/services/poolAnalystService';
import { getBrandMainCommunityId } from '@/lib/brandScope';

// Boxscore fan-out over a full slate (up to ~16 games), each with retry
// backoff, can run long; give it headroom (Vercel Pro allows up to 300s).
export const maxDuration = 300;

/**
 * Authorize the caller: the Vercel cron (bearer CRON_SECRET) or an
 * authenticated global owner triggering a sync manually. Mirrors the
 * authorize() in /api/polls/rotate.
 */
async function authorize(request: Request): Promise<boolean> {
  if (isCronRequest(request)) return true;

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

  // Only the hockey brand ingests NHL data.
  //
  // vercel.json ships with the codebase, so all three deployments registered
  // this 09:00 cron and all three ran the full ingest against the same shared
  // nhl_* tables. The per-game write is a DELETE followed by an INSERT in two
  // separate round-trips, so a second writer landing in between could leave a
  // game with NO stats until the next night — with the pool standings
  // recomputing over the hole. It also tripled the load on the NHL's public
  // API and posted the pool-leader bot message three times, twice with a URL
  // pointing at a brand whose /lnh/pool now 404s.
  if (SITE.category !== 'hockey') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'not the hockey brand' });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Configuration Supabase manquante' }, { status: 500 });
  }
  const admin = createServiceClient(supabaseUrl, serviceKey);

  const url = new URL(request.url);
  const rawDate = url.searchParams.get('date') ?? 'now';
  // Validate before it reaches the NHL API path and the DATE column.
  if (rawDate !== 'now' && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return NextResponse.json({ error: 'date invalide (YYYY-MM-DD)' }, { status: 400 });
  }
  const date = rawDate;

  // Open a run-log row so a silent failure is visible after the fact.
  const { data: runRow } = await admin
    .from('nhl_sync_runs')
    .insert({ status: 'running', target_date: date === 'now' ? null : date })
    .select('id')
    .single();
  const runId = (runRow as { id: number } | null)?.id;

  try {
    // The league's /score/now returns ONLY the current day. Run at 5am the
    // cron therefore saw a slate that had not been played yet, and last
    // night's finals — the only games with boxscores — were never ingested.
    // Every pool standing stayed at zero, with no error anywhere.
    //
    // So a scheduled run syncs yesterday as well as today. The day before is
    // taken from the league's own currentDate rather than from our clock, so
    // no timezone has to be guessed. Yesterday brings in the finals; today
    // keeps the schedule rows fresh and catches a game that ended early.
    // An explicit ?date= still syncs that one day, for backfilling.
    const result = await syncDate(admin, date);
    const extra: SyncResult[] = [];
    if (date === 'now' && result.targetDate) {
      const d = new Date(`${result.targetDate}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 1);
      const yesterday = d.toISOString().slice(0, 10);
      try {
        extra.push(await syncDate(admin, yesterday));
      } catch {
        // One bad day must not lose the run: today's sync already landed and
        // the next run retries yesterday anyway.
      }
    }

    const days: SyncResult[] = [result, ...extra];
    let analysis: { posted: boolean; reason?: string; gameDay?: string } = {
      posted: false, reason: 'non tenté',
    };
    const failed = days.flatMap((d) => d.failedGames);

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
      // nights where games were actually scored (no spam on off-days). The
      // totals across both days, since the finals come from yesterday.
      if (days.reduce((n, d) => n + d.statRows, 0) > 0) {
        const { data: top } = await admin
          .from('pool_standings')
          .select('fantasy_points, pool_entries!inner(team_name)')
          .eq('season_id', seasonId)
          .eq('rank', 1)
          .limit(1)
          .maybeSingle();
        const leader = top as { fantasy_points: number; pool_entries: { team_name: string } } | null;
        if (leader) {
          const communityId = await getBrandMainCommunityId(admin);
          if (communityId) {
            const pts = Number(leader.fantasy_points).toLocaleString('fr-CA', { maximumFractionDigits: 1 });
            await announcePoolLeader(admin, communityId, leader.pool_entries.team_name, pts).catch(() => {});

            // The armchair GM's read on the night. Claims the night before
            // spending anything, so a re-run or a stat correction does not
            // post a second analysis — and never fails the sync.
            analysis = await postDailyPoolAnalysis(admin, seasonId, communityId)
              .catch((e) => ({ posted: false, reason: e instanceof Error ? e.message : 'erreur' }));
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
          // Totals across every day this run touched. Logging today's
          // numbers alone is what let "0 stat rows, every night" look
          // healthy while last night's games were never read.
          target_date: result.targetDate,
          games_seen: days.reduce((n, d) => n + d.gamesSeen, 0),
          games_finalized: days.reduce((n, d) => n + d.gamesFinalized, 0),
          stat_rows: days.reduce((n, d) => n + d.statRows, 0),
          // Surface partial failures without failing the whole run.
          error: failed.length ? `failed games: ${failed.join(', ')}` : null,
        })
        .eq('id', runId);
    }

    return NextResponse.json({ ok: true, ...result, days, analysis });
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

// Refuse cross-site initiations (CSRF via top-level GET with the Lax cookie);
// allow the cron bearer or same-origin / user-initiated requests.
function guard(request: Request) {
  return isCronRequest(request) || isSameOrigin(request);
}
export function GET(request: Request) {
  if (!guard(request)) return NextResponse.json(CROSS_SITE_REFUSED, { status: 403 });
  return handleSync(request);
}

export function POST(request: Request) {
  if (!guard(request)) return NextResponse.json(CROSS_SITE_REFUSED, { status: 403 });
  return handleSync(request);
}
