import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { consumeRateLimit } from '@/lib/rateLimit';

// Lazy migration endpoint for users coming from the legacy Zone Nordiques PHP
// site. The old site stored passwords as raw MD5 hashes. When a user tries to
// sign in and the normal Supabase password fails, the client falls back to
// this endpoint:
//
//   1. Resolve identifier (username or email) to auth.users.email.
//   2. Load the legacy MD5 hash from members_private (service role bypasses RLS).
//   3. If MD5(password) matches the stored hash, update the Supabase password
//      via admin API (bcrypt takes over), flip password_migrated = true, and
//      clear the legacy hash. Return { ok: true } so the client re-tries
//      signInWithPassword with the same password.
//   4. If anything fails, return 401 with a generic message (no enumeration).

// Rate limit: 20 attempts per 15 min per IP to prevent MD5 cracking via the
// API. Enforced through the shared `rate_limits` table so the cap holds
// across serverless instances rather than per-process.
const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 15 * 60;

function md5Hex(input: string): string {
  return createHash('md5').update(input, 'utf8').digest('hex');
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Server not configured' }, { status: 500 });
    }

    // Rate limit by IP (best-effort; behind a proxy the header is what we get)
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';
    const { allowed } = await consumeRateLimit(
      `legacy-login:${ip}`,
      RATE_LIMIT,
      RATE_WINDOW_SECONDS,
    );
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429 },
      );
    }

    const body = (await request.json()) as { identifier?: unknown; password?: unknown };
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!identifier || !password || password.length > 200) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const admin = createServiceClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Resolve identifier -> email via the RPC that already handles usernames.
    let email = identifier;
    if (!email.includes('@')) {
      const { data, error } = await admin.rpc('get_email_from_username', {
        uname: identifier,
      });
      if (error || !data || typeof data !== 'string') {
        return NextResponse.json({ ok: false }, { status: 401 });
      }
      email = data;
    }

    // Find the member by email via members_private (avoids the listUsers 1000
    // pagination limit and is a direct indexed lookup).
    const { data: privRow, error: privLookupErr } = await admin
      .from('members_private')
      .select('member_id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (privLookupErr || !privRow) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }
    const authUser = { id: privRow.member_id };

    // Load the legacy hash (service role bypasses RLS).
    const { data: priv, error: privErr } = await admin
      .from('members_private')
      .select('legacy_password_hash, password_migrated')
      .eq('member_id', authUser.id)
      .maybeSingle();

    if (privErr || !priv || priv.password_migrated || !priv.legacy_password_hash) {
      // Either already migrated, or no legacy hash → caller must use the
      // normal Supabase sign-in or "Forgot password".
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const expected = priv.legacy_password_hash.toLowerCase();
    const computed = md5Hex(password);
    if (!safeEqualHex(expected, computed)) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // MD5 matches — migrate the password to bcrypt and clear the legacy hash.
    const { error: updateErr } = await admin.auth.admin.updateUserById(authUser.id, {
      password,
    });
    if (updateErr) {
      return NextResponse.json({ ok: false, error: 'Password migration failed' }, { status: 500 });
    }

    await admin
      .from('members_private')
      .update({ legacy_password_hash: null, password_migrated: true })
      .eq('member_id', authUser.id);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
