import { NextResponse } from 'next/server';
import { isSameOrigin, CROSS_SITE_REFUSED } from '@/lib/requestGuards';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { SITE } from '@/lib/siteConfig';
import { syncRosters } from '@/services/nhlService';

// 32 sequential roster calls against a rate-limited public API.
export const maxDuration = 300;

/** Only a global owner. Mirrors /api/pool/admin. */
async function isOwner(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from('community_member_roles')
    .select('id, roles!inner(code)')
    .eq('member_id', user.id)
    .eq('roles.code', 'owner')
    .limit(1);
  return Boolean((data as unknown[] | null)?.length);
}

/**
 * Refresh nhl_teams and nhl_players from the league's current rosters.
 *
 * The nightly sync only writes players it saw in a boxscore, so the table
 * holds whoever has played, not whoever exists. Before a season starts, or
 * for a prospect who has not dressed yet, that means the player is simply
 * absent — and the salary importer, which matches by name against this
 * table, reports them as "introuvable" and leaves them unpriced. Running
 * this first is what makes a full snapshot match.
 *
 * Idempotent: every write is an upsert keyed on player_id / abbrev.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json(CROSS_SITE_REFUSED, { status: 403 });

  // Route handlers sit outside app/[locale], so the segment gate that 404s
  // the pool off the hockey brand does not reach here.
  if (!SITE.showPool || SITE.category !== 'hockey') {
    return NextResponse.json({ error: 'Pool indisponible sur ce site' }, { status: 404 });
  }

  if (!(await isOwner())) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Configuration Supabase manquante' }, { status: 500 });
  }

  try {
    const admin = createServiceClient(supabaseUrl, serviceKey);
    const result = await syncRosters(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
