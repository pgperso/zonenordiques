import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BRAND } from '@/lib/brand';

// Verified Resend sending domain (see DNS cutover). Display name + address.
export const NEWSLETTER_FROM = `${BRAND.name} <${BRAND.email}>`;

// Resend caps batch.send at 100 messages per call.
export const RESEND_BATCH_SIZE = 100;

let cached: Resend | null = null;

/**
 * Lazily construct the Resend client. Throws a clear error if the API key is
 * missing so a misconfigured deploy fails loudly instead of silently dropping
 * mail.
 */
export function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY manquant');
  if (!cached) cached = new Resend(key);
  return cached;
}

export interface DigestArticle {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  communitySlug: string;
}

/**
 * The articles featured in a weekly digest: everything published in the last
 * `days` days, newest first. Returns [] when nothing qualifies so the cron can
 * skip the send rather than mail an empty digest.
 */
export async function fetchDigestArticles(
  admin: SupabaseClient,
  days = 7,
  limit = 8,
): Promise<DigestArticle[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from('articles')
    .select('id, title, slug, excerpt, cover_image_url, published_at, communities!inner(slug)')
    .eq('is_published', true)
    .eq('is_removed', false)
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as Array<
    Omit<DigestArticle, 'communitySlug'> & { communities: { slug: string } | null }
  >;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    slug: r.slug,
    excerpt: r.excerpt,
    cover_image_url: r.cover_image_url,
    published_at: r.published_at,
    communitySlug: r.communities?.slug ?? 'zone-nordiques',
  }));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const T = {
  fr: {
    confirmSubject: `Confirmez votre inscription à l'infolettre ${BRAND.name}`,
    confirmHeading: 'Une dernière étape',
    confirmBody: `Merci de votre intérêt pour l'infolettre de ${BRAND.name}. Cliquez sur le bouton ci-dessous pour confirmer votre inscription et recevoir notre récap hebdomadaire du hockey.`,
    confirmCta: 'Confirmer mon inscription',
    confirmIgnore: "Vous n'avez pas demandé cette inscription ? Ignorez simplement ce courriel.",
    digestSubject: `Votre récap hockey de la semaine — ${BRAND.name}`,
    digestHeading: 'Le meilleur de la semaine',
    digestIntro: 'Voici les articles à ne pas manquer sur la Zone cette semaine.',
    readMore: 'Lire',
    visitSite: 'Voir tout sur',
    unsubscribe: 'Se désabonner',
    unsubscribeLine: "Vous recevez ce courriel parce que vous êtes inscrit à l'infolettre de",
  },
  en: {
    confirmSubject: `Confirm your subscription to the ${BRAND.name} newsletter`,
    confirmHeading: 'One last step',
    confirmBody: `Thanks for your interest in the ${BRAND.name} newsletter. Click the button below to confirm your subscription and get our weekly hockey recap.`,
    confirmCta: 'Confirm my subscription',
    confirmIgnore: "Didn't request this? Just ignore this email.",
    digestSubject: `Your weekly hockey recap — ${BRAND.name}`,
    digestHeading: 'The best of the week',
    digestIntro: "Here are this week's must-read stories on the Zone.",
    readMore: 'Read',
    visitSite: 'See everything on',
    unsubscribe: 'Unsubscribe',
    unsubscribeLine: "You're receiving this because you subscribed to the newsletter of",
  },
} as const;

type Locale = 'fr' | 'en';
const dict = (locale: string) => T[(locale === 'en' ? 'en' : 'fr') as Locale];

const BLUE = BRAND.colors.blue;
const RED = BRAND.colors.orange;

function shell(locale: string, unsubscribeUrl: string | null, inner: string): string {
  const t = dict(locale);
  const foot = unsubscribeUrl
    ? `<p style="margin:0 0 6px;color:#9aa0a6;font-size:12px;line-height:1.5">
         ${t.unsubscribeLine} <strong>${BRAND.name}</strong>.
       </p>
       <p style="margin:0;font-size:12px">
         <a href="${unsubscribeUrl}" style="color:#9aa0a6;text-decoration:underline">${t.unsubscribe}</a>
       </p>`
    : `<p style="margin:0;color:#9aa0a6;font-size:12px">© ${BRAND.name} · ${BRAND.domain}</p>`;

  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f4f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
        <tr><td style="background:${BLUE};padding:20px 28px" align="center">
          <a href="${BRAND.url}" style="text-decoration:none;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;letter-spacing:.3px">
            ${BRAND.name}
          </a>
        </td></tr>
        <tr><td style="padding:28px;font-family:Arial,Helvetica,sans-serif;color:#111827">
          ${inner}
        </td></tr>
        <tr><td style="padding:20px 28px;background:#0b1220;font-family:Arial,Helvetica,sans-serif" align="center">
          ${foot}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/** Double opt-in confirmation email (transactional — sent on subscribe). */
export function buildConfirmationEmail(locale: string, confirmUrl: string): {
  subject: string;
  html: string;
} {
  const t = dict(locale);
  const inner = `
    <h1 style="margin:0 0 12px;font-size:22px;color:${BLUE}">${t.confirmHeading}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#374151">${t.confirmBody}</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:8px;background:${RED}">
      <a href="${confirmUrl}" style="display:inline-block;padding:12px 26px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">
        ${t.confirmCta}
      </a>
    </td></tr></table>
    <p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#9aa0a6">${t.confirmIgnore}</p>`;
  return { subject: t.confirmSubject, html: shell(locale, null, inner) };
}

/** Weekly digest email. `unsubscribeUrl` is per-subscriber. */
export function buildDigestEmail(
  locale: string,
  articles: DigestArticle[],
  unsubscribeUrl: string,
): { subject: string; html: string } {
  const t = dict(locale);
  const cards = articles
    .map((a) => {
      const url = `${BRAND.url}/${locale}/tribunes/${a.communitySlug}/articles/${a.slug}`;
      const img = a.cover_image_url
        ? `<a href="${url}"><img src="${escapeHtml(a.cover_image_url)}" width="544" alt="" style="display:block;width:100%;max-width:544px;height:auto;border-radius:8px;margin-bottom:10px"></a>`
        : '';
      const excerpt = a.excerpt
        ? `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#4b5563">${escapeHtml(a.excerpt)}</p>`
        : '';
      return `
        <tr><td style="padding:0 0 26px">
          ${img}
          <a href="${url}" style="text-decoration:none">
            <h2 style="margin:0 0 6px;font-size:18px;line-height:1.35;color:#111827">${escapeHtml(a.title)}</h2>
          </a>
          ${excerpt}
          <a href="${url}" style="display:inline-block;font-size:14px;font-weight:bold;color:${RED};text-decoration:none">
            ${t.readMore} →
          </a>
        </td></tr>`;
    })
    .join('');

  const inner = `
    <h1 style="margin:0 0 6px;font-size:22px;color:${BLUE}">${t.digestHeading}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151">${t.digestIntro}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}</table>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px"><tr><td style="border-radius:8px;background:${BLUE}">
      <a href="${BRAND.url}/${locale}" style="display:inline-block;padding:11px 24px;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">
        ${t.visitSite} ${BRAND.name}
      </a>
    </td></tr></table>`;
  return { subject: t.digestSubject, html: shell(locale, unsubscribeUrl, inner) };
}

export function confirmUrl(token: string): string {
  return `${BRAND.url}/api/newsletter/confirm?token=${token}`;
}
export function unsubscribeUrl(token: string): string {
  return `${BRAND.url}/api/newsletter/unsubscribe?token=${token}`;
}
