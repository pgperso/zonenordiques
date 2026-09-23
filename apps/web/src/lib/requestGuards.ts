import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Request-level security guards shared by the API routes.
 *
 * Threat model these address (adversarial audit, E-03 / M-12): the Supabase
 * session cookie is SameSite=Lax, so a cross-site *top-level GET navigation*
 * carries it. Any cookie-authenticated handler reachable by GET was therefore
 * CSRF-able by making an owner click a link (e.g. sending the newsletter to
 * every subscriber). Cookie-authenticated POSTs relied on Lax alone.
 */

/** True when the request carries the Vercel cron bearer, compared in constant
 *  time. False (never throws) when CRON_SECRET is unset — fail closed. */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get('authorization') ?? '';
  if (!secret || !header.startsWith('Bearer ')) return false;
  // Hash both sides so lengths always match and the compare is constant-time.
  const a = createHash('sha256').update(header.slice(7)).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

/**
 * True when the request was initiated by OUR site or directly by the user, and
 * false for a cross-site initiation (a link/form/fetch on an attacker's page).
 *
 * - Modern browsers send `Sec-Fetch-Site`: `same-origin` / `same-site` (our
 *   pages) or `none` (URL typed, bookmark) are the user's own actions;
 *   `cross-site` is exactly the CSRF case → refused.
 * - Without that header (old client, server-to-server), fall back to comparing
 *   the `Origin` (or `Referer`) host with the request host; with neither, refuse.
 *
 * Callers that also accept the cron bearer should check `isCronRequest` first —
 * the cron has no browser headers and is authorized by its secret instead.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'same-site' || site === 'none';

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return false;
  const ref = request.headers.get('origin') ?? request.headers.get('referer');
  if (!ref) return false;
  try {
    return new URL(ref).host === host;
  } catch {
    return false;
  }
}

/** JSON 403 for a refused cross-site request. */
export const CROSS_SITE_REFUSED = { error: 'Origine refusée' } as const;
