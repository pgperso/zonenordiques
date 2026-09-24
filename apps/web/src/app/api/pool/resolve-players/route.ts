import { NextResponse } from 'next/server';
import { isSameOrigin, CROSS_SITE_REFUSED } from '@/lib/requestGuards';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { SITE } from '@/lib/siteConfig';
import { resolveMissingPlayers, type ResolveRequest } from '@/services/nhlService';

// One search call per name, sequential, against a rate-limited public index.
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

// A full snapshot leaves at most a few hundred names unresolved; anything
// beyond that is a malformed file, not a roster gap.
const MAX_NAMES = 400;

/**
 * Add the players a salary import could not match to nhl_players.
 *
 * A drafted prospect who has not dressed yet is on no NHL roster, so the
 * roster sync never sees them and the pool cannot reference them at all —
 * they get no price and no draft slot, even though the spreadsheet gives
 * them a rookie cap hit. The league's search index does carry them, with
 * their real playerId, which is the only thing that was missing.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json(CROSS_SITE_REFUSED, { status: 403 });

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

  let body: { players?: ResolveRequest[] };
  try {
    body = (await request.json()) as { players?: ResolveRequest[] };
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const players = (body.players ?? [])
    .filter((p) => typeof p?.name === 'string' && p.name.trim())
    .map((p) => ({ name: p.name.trim(), team: String(p.team ?? '').trim() }))
    .slice(0, MAX_NAMES);

  if (players.length === 0) {
    return NextResponse.json({ error: 'Aucun nom à résoudre' }, { status: 400 });
  }

  try {
    const admin = createServiceClient(supabaseUrl, serviceKey);
    const report = await resolveMissingPlayers(admin, players);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
