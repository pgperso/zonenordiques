import { NextResponse } from 'next/server';
import { isSameOrigin, CROSS_SITE_REFUSED } from '@/lib/requestGuards';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { SITE } from '@/lib/siteConfig';
import { importSalaries } from '@/services/poolService';

// 800+ rows, one matching pass over every NHL player, one upsert.
export const maxDuration = 60;

/** Only a global owner may price the pool. Mirrors /api/pool/admin. */
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

interface Body {
  seasonId: number;
  csv: string;
  /** Preview only: parse, match and report, write nothing. */
  dryRun?: boolean;
  /** Mark every other priced player non-draftable first (start of season). */
  fullSnapshot?: boolean;
  /** Optionally set the season's cap at the same time, in dollars. */
  budgetDollars?: number | null;
}

// A full NHL roster snapshot is ~1000 rows; 2 MB is generous for that and
// still refuses an accidental upload of something much larger.
const MAX_CSV_BYTES = 2_000_000;

export async function POST(request: Request) {
  // Cookie-authenticated mutation: SameSite=Lax alone does not stop CSRF.
  if (!isSameOrigin(request)) return NextResponse.json(CROSS_SITE_REFUSED, { status: 403 });

  // Route handlers are not children of app/[locale] layouts, so the segment
  // gate that 404s /lnh/pool off the hockey brand does not cover this. Repeat
  // it here or the baseball and football deployments would each expose a way
  // to reprice the shared NHL pool.
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
  }

  const { seasonId, csv, dryRun, fullSnapshot, budgetDollars } = body;
  if (!seasonId) return NextResponse.json({ error: 'seasonId requis' }, { status: 400 });
  if (typeof csv !== 'string' || !csv.trim()) {
    return NextResponse.json({ error: 'Fichier vide' }, { status: 400 });
  }
  if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) {
    return NextResponse.json({ error: 'Fichier trop volumineux (max 2 Mo)' }, { status: 413 });
  }
  // An .xlsx is a ZIP archive; its first bytes are "PK". Say so plainly
  // instead of failing later with "aucune colonne de nom trouvée".
  if (csv.startsWith('PK')) {
    return NextResponse.json(
      { error: 'Ce fichier est un .xlsx. Dans Excel : Fichier → Enregistrer sous → CSV UTF-8, puis réessaie.' },
      { status: 400 },
    );
  }

  const admin = createServiceClient(supabaseUrl, serviceKey);

  try {
    const report = await importSalaries(admin, seasonId, csv, {
      dryRun: Boolean(dryRun),
      fullSnapshot: Boolean(fullSnapshot),
      budgetCents:
        typeof budgetDollars === 'number' && budgetDollars > 0
          ? Math.round(budgetDollars * 100)
          : undefined,
    });
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
