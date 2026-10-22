/**
 * Trustworthy client IP for rate limiting and view de-duplication.
 *
 * The leftmost `x-forwarded-for` entry is CLIENT-controllable, so keying rate
 * limits on it lets an attacker rotate the header to get a fresh limit bucket
 * every request (defeating brute-force / enumeration throttles). `x-real-ip`
 * is set by the edge in front of the app and cannot be spoofed by the client —
 * prefer it:
 *   - on Vercel, the platform sets it from the real TCP connection;
 *   - on the la-zone VPS, nginx overwrites it with the visitor IP restored
 *     from CF-Connecting-IP, trusted only from Cloudflare's ranges
 *     (deploy/server/nginx/la-zone.conf, deploy/server/cloudflare-ips.sh).
 * Fall back to Vercel's forwarded header, then the XFF (local dev only), then
 * a constant.
 *
 * Accepts a Request (route handlers) or a Headers object (server components via
 * `await headers()`).
 */
export function getClientIp(source: Request | Headers): string {
  const h = source instanceof Headers ? source : source.headers;

  const realIp = h.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();

  const vercel = h.get('x-vercel-forwarded-for');
  if (vercel && vercel.trim()) return vercel.split(',')[0].trim();

  const xff = h.get('x-forwarded-for');
  if (xff && xff.trim()) return xff.split(',')[0].trim();

  return 'unknown';
}
