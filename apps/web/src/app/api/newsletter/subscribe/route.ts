import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeRateLimit } from '@/lib/rateLimit';
import {
  getResend,
  NEWSLETTER_FROM,
  buildConfirmationEmail,
  confirmUrl,
} from '@/services/newsletterService';

// Conservative single-line email check. Real validation is the double opt-in:
// an address that can't receive the confirmation never becomes 'confirmed'.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: { email?: string; locale?: string; website?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  }

  // Honeypot: legitimate submissions leave the hidden `website` field empty.
  // Bots that fill everything get a fake success and nothing happens.
  if (body.website) return NextResponse.json({ ok: true });

  const email = (body.email ?? '').trim().toLowerCase();
  const locale = body.locale === 'en' ? 'en' : 'fr';
  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'Courriel invalide' }, { status: 400 });
  }

  // Throttle by IP: 5 subscribe attempts per hour is plenty for a human and
  // blocks using the confirmation mailer as a spam relay.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rl = await consumeRateLimit(`newsletter:subscribe:${ip}`, 5, 3600);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, { status: 429 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: 'Configuration serveur manquante' }, { status: 500 });
  }

  const { data: existing } = await admin
    .from('newsletter_subscribers')
    .select('id, status, confirm_token')
    .eq('email_lower', email)
    .maybeSingle();

  let token: string | null = null;
  if (!existing) {
    const { data, error } = await admin
      .from('newsletter_subscribers')
      .insert({ email, locale })
      .select('confirm_token')
      .single();
    if (error || !data) {
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
    token = (data as { confirm_token: string }).confirm_token;
  } else if (existing.status === 'confirmed') {
    // Already subscribed. Return generic success without re-sending, so the
    // endpoint never reveals whether an address is on the list.
    return NextResponse.json({ ok: true });
  } else {
    // pending or previously unsubscribed → reset to pending and re-send the
    // confirmation (a fresh consent event).
    await admin
      .from('newsletter_subscribers')
      .update({ status: 'pending', locale, unsubscribed_at: null })
      .eq('id', existing.id);
    token = existing.confirm_token;
  }

  if (!token) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });

  try {
    const { subject, html } = buildConfirmationEmail(locale, confirmUrl(token));
    // The Resend SDK reports API failures via the returned `error` field
    // rather than throwing, so check it explicitly — otherwise a rejected
    // send would look like success.
    const { error: sendErr } = await getResend().emails.send({
      from: NEWSLETTER_FROM,
      to: email,
      subject,
      html,
    });
    if (sendErr) throw new Error(sendErr.message ?? 'Resend send error');
  } catch {
    return NextResponse.json(
      { error: 'Envoi du courriel de confirmation impossible' },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
