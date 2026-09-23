import { NextResponse } from 'next/server';
import { consumeRateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/clientIp';
import { buildLinkPreview } from '@/lib/linkPreview';

// Public read-only preview endpoint (used by the editor / composer to show a
// card before posting). SSRF protections live in buildLinkPreview → safeFetch.
// Rate-limited per IP so it can't be used as an anonymous scraping/probing proxy.
// NOTE: chat previews are no longer written by the client from this response —
// see /api/chat/link-previews.
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const { allowed } = await consumeRateLimit(`link-preview:${getClientIp(request)}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const preview = await buildLinkPreview(url);
  if (!preview) return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });

  return NextResponse.json(preview, {
    headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
  });
}
