import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeRateLimit } from '@/lib/rateLimit';

// Resolves a username to its login email for the sign-in / password-reset forms.
// The underlying RPC used to be callable directly from the browser with no rate
// limit, which let anyone harvest member emails by iterating usernames. Now the
// RPC is revoked from anon/authenticated (migration 00103) and this server route
// is the only path — rate-limited per IP so bulk enumeration is impractical.
export const runtime = 'nodejs';

function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  return (xff ? xff.split(',')[0] : '').trim() || 'unknown';
}

export async function POST(request: Request) {
  const { allowed } = await consumeRateLimit(`resolve-email:${clientIp(request)}`, 15, 60);
  if (!allowed) {
    return NextResponse.json({ email: null }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  let identifier = '';
  try {
    identifier = String((await request.json()).identifier ?? '').trim();
  } catch {
    /* invalid body */
  }
  if (!identifier) return NextResponse.json({ email: null });

  // Already an email → nothing to resolve.
  if (identifier.includes('@')) return NextResponse.json({ email: identifier });

  const admin = createAdminClient();
  const { data } = await admin.rpc('get_email_from_username' as never, { uname: identifier } as never);
  return NextResponse.json({ email: typeof data === 'string' && data ? data : null });
}
