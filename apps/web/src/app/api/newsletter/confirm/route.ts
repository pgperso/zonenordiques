import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BRAND } from '@/lib/brand';

// Double opt-in confirmation. The link in the confirmation email lands here;
// we flip the row to 'confirmed' and redirect to a human-facing result page.
function resultUrl(status: string, locale = 'fr'): string {
  return `${BRAND.url}/${locale}/infolettre?status=${status}`;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return NextResponse.redirect(resultUrl('error'));

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.redirect(resultUrl('error'));
  }

  const { data } = await admin
    .from('newsletter_subscribers')
    .select('id, status, locale')
    .eq('confirm_token', token)
    .maybeSingle();

  if (!data) return NextResponse.redirect(resultUrl('error'));
  const locale = data.locale === 'en' ? 'en' : 'fr';

  if (data.status !== 'confirmed') {
    await admin
      .from('newsletter_subscribers')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        unsubscribed_at: null,
      })
      .eq('id', data.id);
  }

  return NextResponse.redirect(resultUrl('confirmed', locale));
}
