import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BRAND } from '@/lib/brand';

// Per-subscriber unsubscribe. GET handles the human clicking the link in an
// email (redirect to a result page); POST handles RFC 8058 one-click
// unsubscribe (the List-Unsubscribe-Post header), which mail clients fire
// automatically and expect a 2xx with no redirect.

async function unsubscribe(token: string | null): Promise<'fr' | 'en' | null> {
  if (!token) return null;
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  const { data } = await admin
    .from('newsletter_subscribers')
    .select('id, status, locale')
    .eq('unsubscribe_token', token)
    .maybeSingle();
  if (!data) return null;

  if (data.status !== 'unsubscribed') {
    await admin
      .from('newsletter_subscribers')
      .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
      .eq('id', data.id);
  }
  return data.locale === 'en' ? 'en' : 'fr';
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  const locale = await unsubscribe(token);
  const status = locale ? 'unsubscribed' : 'error';
  return NextResponse.redirect(`${BRAND.url}/${locale ?? 'fr'}/infolettre?status=${status}`);
}

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  await unsubscribe(token);
  // One-click clients ignore the body; a 200 is the acknowledgement.
  return new NextResponse(null, { status: 200 });
}
