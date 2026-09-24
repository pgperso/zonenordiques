import { NextResponse } from 'next/server';
import { BRAND } from '@/lib/brand';
import { isCronRequest, isSameOrigin, CROSS_SITE_REFUSED } from '@/lib/requestGuards';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getResend,
  NEWSLETTER_FROM,
  RESEND_BATCH_SIZE,
  fetchDigestArticles,
  buildDigestEmail,
  unsubscribeUrl,
} from '@/services/newsletterService';

// Fanning out email in batches of 100 can run long on a large list.
export const maxDuration = 300;

/**
 * Authorize: the Vercel cron (bearer CRON_SECRET) or an authenticated global
 * owner triggering a manual send. Identical to the nhl-sync authorizer.
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

interface Subscriber {
  id: number;
  email: string;
  locale: string;
  unsubscribe_token: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function handleSend(request: Request) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 });
  }

  // Idempotence: the digest goes out at most once a week. A replayed trigger
  // (double cron fire, or a re-clicked manual send) must never re-mail every
  // subscriber.
  // Every brand runs this cron against the same shared tables, so each
  // read and write below is pinned to this deployment's brand. Unpinned,
  // the first site to fire consumed the week's slot for all of them and
  // mailed its digest to every other site's subscribers.
  const { data: recentOk } = await admin
    .from('newsletter_sends')
    .select('id')
    .eq('brand_id', BRAND.id)
    .eq('status', 'ok')
    .gte('finished_at', new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString())
    .limit(1);
  if ((recentOk as unknown[] | null)?.length) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'already sent this week' });
  }

  const { data: runRow } = await admin
    .from('newsletter_sends')
    .insert({ status: 'running', brand_id: BRAND.id })
    .select('id')
    .single();
  const runId = (runRow as { id: number } | null)?.id;

  const finish = (fields: Record<string, unknown>) =>
    runId
      ? admin.from('newsletter_sends').update({ finished_at: new Date().toISOString(), ...fields }).eq('id', runId)
      : Promise.resolve();

  try {
    const articles = await fetchDigestArticles(admin);
    if (articles.length === 0) {
      await finish({ status: 'skipped', articles_count: 0, error: 'aucun article cette semaine' });
      return NextResponse.json({ ok: true, skipped: true, reason: 'no articles' });
    }

    const { data: subsData, error: subsErr } = await admin
      .from('newsletter_subscribers')
      .select('id, email, locale, unsubscribe_token')
      .eq('brand_id', BRAND.id)
      .eq('status', 'confirmed');
    if (subsErr) throw new Error(subsErr.message);
    const subscribers = (subsData ?? []) as Subscriber[];

    if (subscribers.length === 0) {
      await finish({ status: 'skipped', articles_count: articles.length, recipients: 0 });
      return NextResponse.json({ ok: true, skipped: true, reason: 'no subscribers' });
    }

    // Each recipient gets their own unsubscribe URL, so the digest HTML is
    // rendered per subscriber (cheap string assembly) and sent in batches of
    // 100 via Resend's batch API.
    const resend = getResend();
    let sent = 0;

    for (const batch of chunk(subscribers, RESEND_BATCH_SIZE)) {
      const payload = batch.map((s) => {
        const url = unsubscribeUrl(s.unsubscribe_token);
        const { subject, html } = buildDigestEmail(s.locale, articles, url);
        return {
          from: NEWSLETTER_FROM,
          to: s.email,
          subject,
          html,
          headers: {
            'List-Unsubscribe': `<${url}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        };
      });

      const { error } = await resend.batch.send(payload);
      if (error) throw new Error(error.message ?? 'Resend batch error');
      sent += batch.length;
    }

    const nowIso = new Date().toISOString();
    await admin
      .from('newsletter_subscribers')
      .update({ last_sent_at: nowIso })
      .eq('brand_id', BRAND.id)
      .eq('status', 'confirmed');

    await finish({ status: 'ok', articles_count: articles.length, recipients: sent });
    return NextResponse.json({ ok: true, recipients: sent, articles: articles.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur inconnue';
    await finish({ status: 'error', error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// A cookie-authenticated trigger is CSRF-able by a cross-site top-level GET
// (SameSite=Lax carries the session cookie): a link on a third-party page could
// make an owner mail every subscriber. Only the cron bearer, or a same-origin /
// user-initiated request, may reach the handler.
function guard(request: Request) {
  return isCronRequest(request) || isSameOrigin(request);
}
export function GET(request: Request) {
  if (!guard(request)) return NextResponse.json(CROSS_SITE_REFUSED, { status: 403 });
  return handleSend(request);
}
export function POST(request: Request) {
  if (!guard(request)) return NextResponse.json(CROSS_SITE_REFUSED, { status: 403 });
  return handleSend(request);
}
