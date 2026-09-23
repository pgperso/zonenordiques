/**
 * Trustworthy client IP for rate limiting.
 *
 * The leftmost `x-forwarded-for` entry is CLIENT-controllable, so keying rate
 * limits on it lets an attacker rotate the header to get a fresh limit bucket
 * every request (defeating brute-force / enumeration throttles). On Vercel,
 * `x-real-ip` is set by the platform from the real TCP connection and cannot be
 * spoofed by the client — prefer it. Fall back to Vercel's forwarded header,
 * then the XFF (local dev only), then a constant.
 */
export function getClientIp(request: Request): string {
  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim()) return realIp.trim();

  const vercel = request.headers.get('x-vercel-forwarded-for');
  if (vercel && vercel.trim()) return vercel.split(',')[0].trim();

  const xff = request.headers.get('x-forwarded-for');
  if (xff && xff.trim()) return xff.split(',')[0].trim();

  return 'unknown';
}
