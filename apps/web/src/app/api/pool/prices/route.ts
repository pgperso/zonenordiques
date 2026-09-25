import { NextResponse } from 'next/server';
import { isSameOrigin, CROSS_SITE_REFUSED } from '@/lib/requestGuards';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { SITE } from '@/lib/siteConfig';
import { getPlayersToPrice, setManualPrices } from '@/services/poolService';

/** Only a global owner may price the pool. Mirrors /api/pool/salaries. */
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
 * Route handlers are not children of app/[locale] layouts, so the segment gate
 * that 404s /lnh/pool off the hockey brand does not cover this. Repeated here
 * or the baseball and football deployments would each expose a way to reprice
 * the shared NHL pool.
 */
function guard(request: Request): NextResponse | null {
  if (!isSameOrigin(request)) return NextResponse.json(CROSS_SITE_REFUSED, { status: 403 });
  if (!SITE.showPool || SITE.category !== 'hockey') {
    return NextResponse.json({ error: 'Pool indisponible sur ce site' }, { status: 404 });
  }
  return null;
}

function service() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) return null;
  return createServiceClient(supabaseUrl, serviceKey);
}

function seasonIdFrom(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The players still waiting for a salary. */
export async function GET(request: Request) {
  const refused = guard(request);
  if (refused) return refused;
  if (!(await isOwner())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const seasonId = seasonIdFrom(new URL(request.url).searchParams.get('seasonId'));
  if (seasonId === null) return NextResponse.json({ error: 'Saison invalide' }, { status: 400 });

  const admin = service();
  if (!admin) return NextResponse.json({ error: 'Configuration Supabase manquante' }, { status: 500 });

  try {
    return NextResponse.json({ players: await getPlayersToPrice(admin, seasonId) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur inconnue' }, { status: 500 });
  }
}

// A cap hit well beyond anything the NHL allows is a typo — 12 500 000 entered
// where 12.5 was meant. Refusing it here is cheaper than finding it in a pool
// people have already drafted from.
const MAX_PRICE_CENTS = 30_000_000_00;
const MAX_ENTRIES = 500;

/** Set salaries by hand. A price of 0 puts the player back on the list. */
export async function POST(request: Request) {
  const refused = guard(request);
  if (refused) return refused;
  if (!(await isOwner())) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const admin = service();
  if (!admin) return NextResponse.json({ error: 'Configuration Supabase manquante' }, { status: 500 });

  let body: { seasonId?: unknown; prices?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const seasonId = seasonIdFrom(body.seasonId);
  if (seasonId === null) return NextResponse.json({ error: 'Saison invalide' }, { status: 400 });

  // Guard the shape before mapping: a non-array `prices` would throw outside
  // the try below and return an unhandled 500 instead of this 400.
  const raw = Array.isArray(body.prices) ? body.prices : [];
  const entries: Array<{ playerId: number; priceCents: number }> = [];
  for (const p of raw.slice(0, MAX_ENTRIES)) {
    const row = p as { playerId?: unknown; priceCents?: unknown };
    const playerId = Number(row.playerId);
    const priceCents = Number(row.priceCents);
    if (!Number.isInteger(playerId) || playerId <= 0) continue;
    if (!Number.isFinite(priceCents) || priceCents < 0 || priceCents > MAX_PRICE_CENTS) {
      return NextResponse.json(
        { error: `Salaire hors limites pour le joueur ${playerId} (max ${MAX_PRICE_CENTS / 1e8} M$)` },
        { status: 400 },
      );
    }
    entries.push({ playerId, priceCents: Math.round(priceCents) });
  }
  if (entries.length === 0) return NextResponse.json({ error: 'Aucun salaire à enregistrer' }, { status: 400 });

  try {
    const saved = await setManualPrices(admin, seasonId, entries);
    return NextResponse.json({ ok: true, saved, players: await getPlayersToPrice(admin, seasonId) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Erreur inconnue' }, { status: 500 });
  }
}
