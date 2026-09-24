import { NextResponse } from 'next/server';
import { getBrandCategoryId } from '@/lib/brandScope';
import { isCronRequest, isSameOrigin, CROSS_SITE_REFUSED } from '@/lib/requestGuards';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// Daily cron — fast, but give it headroom.
export const maxDuration = 30;

/**
 * Authorize the caller: the Vercel cron (bearer CRON_SECRET) or an
 * authenticated global owner triggering a rotation manually.
 */
async function authorize(request: Request): Promise<boolean> {
  if (isCronRequest(request)) return true;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
 * Rotates the active poll. Runs daily (1st cron in vercel.json after
 * generation). Picks the most-recently-due scheduled poll, makes it
 * active, and archives both the outgoing active poll and any older
 * scheduled polls whose window was skipped (e.g. after cron downtime).
 */
async function handleRotate(request: Request) {
  try {
    if (!(await authorize(request))) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !supabaseUrl) {
      return NextResponse.json({ error: 'Configuration Supabase manquante' }, { status: 500 });
    }
    const admin = createServiceClient(supabaseUrl, serviceKey);

    const nowIso = new Date().toISOString();

    // Every brand runs this cron against the same shared table, so each run
    // must stay inside its own sport — otherwise the first site to fire
    // archives the other sites' active polls and promotes its own.
    const categoryId = await getBrandCategoryId(admin as never);
    if (categoryId == null) {
      return NextResponse.json({ error: 'Catégorie de marque introuvable' }, { status: 500 });
    }

    // Scheduled polls whose go-live date has arrived, newest date first.
    const { data: dueData } = await admin
      .from('polls')
      .select('id, scheduled_for')
      .eq('category_id', categoryId)
      .eq('status', 'scheduled')
      .lte('scheduled_for', nowIso)
      .order('scheduled_for', { ascending: false });

    const due = (dueData ?? []) as { id: number }[];
    if (due.length === 0) {
      return NextResponse.json({ rotated: false });
    }

    const winnerId = due[0].id;
    const skippedIds = due.slice(1).map((p) => p.id);

    // Archive the current active poll of THIS sport only.
    await admin
      .from('polls')
      .update({ status: 'archived', archived_at: nowIso })
      .eq('category_id', categoryId)
      .eq('status', 'active');

    // Archive scheduled polls whose window was skipped.
    if (skippedIds.length > 0) {
      await admin
        .from('polls')
        .update({ status: 'archived', archived_at: nowIso })
        .in('id', skippedIds);
    }

    // Promote the winner.
    await admin
      .from('polls')
      .update({ status: 'active', activated_at: nowIso })
      .eq('id', winnerId);

    return NextResponse.json({ rotated: true, pollId: winnerId, skipped: skippedIds.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
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
  return handleRotate(request);
}

export function POST(request: Request) {
  if (!guard(request)) return NextResponse.json(CROSS_SITE_REFUSED, { status: 403 });
  return handleRotate(request);
}
