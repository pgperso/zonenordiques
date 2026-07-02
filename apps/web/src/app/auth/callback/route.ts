import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin, hash } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  const supabase = await createClient();

  // PKCE flow (email confirmation, magic links)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Token hash flow (password recovery)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as 'recovery' | 'email' });
    if (!error) {
      // Redirect to update-password page
      return NextResponse.redirect(`${origin}/fr/update-password`);
    }
  }

  // Auth error — redirect to login with error
  return NextResponse.redirect(`${origin}/fr/login?error=auth`);
}
