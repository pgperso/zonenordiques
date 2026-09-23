import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeRateLimit } from '@/lib/rateLimit';
import { isSameOrigin, CROSS_SITE_REFUSED } from '@/lib/requestGuards';
import { buildLinkPreview, type LinkPreview } from '@/lib/linkPreview';
import { extractUrls } from '@/lib/fetchUrlContent';

// Attach link-preview cards to a chat message, SERVER-side.
//
// Security (audit F-12): the client used to fetch previews and PATCH
// chat_messages.link_previews itself, so a member could forge a card (any
// title / image / url) on their own message — visual phishing that bypassed the
// preview endpoint. Now the client only says "attach previews to message X";
// we verify the caller owns X, extract the URLs from the STORED content (not
// from the request), build the cards through the SSRF-safe fetcher, and write
// them with the service role. Direct client writes to link_previews are
// refused by the DB trigger (migration 00107).
export const runtime = 'nodejs';
export const maxDuration = 30;

const MAX_URLS = 3;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json(CROSS_SITE_REFUSED, { status: 403 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const { allowed } = await consumeRateLimit(`chat-previews:${user.id}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  let messageId = '';
  try {
    messageId = String((await request.json()).messageId ?? '').trim();
  } catch {
    /* invalid body */
  }
  if (!/^\d+$/.test(messageId)) return NextResponse.json({ error: 'messageId invalide' }, { status: 400 });

  const admin = createAdminClient();
  const { data: msg } = await admin
    .from('chat_messages')
    .select('id, member_id, content, link_previews')
    .eq('id', Number(messageId))
    .maybeSingle();

  const row = msg as { id: number; member_id: string; content: string | null; link_previews: unknown } | null;
  if (!row) return NextResponse.json({ error: 'Message introuvable' }, { status: 404 });
  // Only the author may trigger previews for their message.
  if (row.member_id !== user.id) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
  // Idempotent: previews already attached.
  if (Array.isArray(row.link_previews) && row.link_previews.length > 0) {
    return NextResponse.json({ ok: true, count: row.link_previews.length, skipped: true });
  }

  // URLs come from what is STORED, never from the request body.
  const urls = [...new Set(extractUrls(row.content ?? ''))].slice(0, MAX_URLS);
  if (urls.length === 0) return NextResponse.json({ ok: true, count: 0 });

  const results = await Promise.all(urls.map((u) => buildLinkPreview(u)));
  const previews = results.filter((p): p is LinkPreview => Boolean(p && (p.title || p.image)));
  if (previews.length === 0) return NextResponse.json({ ok: true, count: 0 });

  const { error } = await admin
    .from('chat_messages')
    .update({ link_previews: previews } as never)
    .eq('id', row.id);
  if (error) return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });

  return NextResponse.json({ ok: true, count: previews.length });
}
