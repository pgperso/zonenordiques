import { NextResponse } from 'next/server';
import { BRAND } from '@/lib/brand';
import { consumeRateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/clientIp';
import { safeFetch } from '@/lib/safeFetch';

// This route fetches a user-supplied URL server-side, so it goes through
// safeFetch: private / loopback / link-local / metadata targets are refused
// (including via DNS resolution + IP pinning against rebinding), redirects are
// re-validated per hop, and the body is read with a hard byte cap. It is also
// rate-limited per IP so it can't be used as an anonymous scraping/probing proxy.
export const runtime = 'nodejs';

const TIMEOUT_MS = 5000;
const MAX_HTML_SIZE = 100000; // 100KB max to parse

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Anonymous endpoint → rate-limit per IP so it can't be a scraping/probing proxy.
  const { allowed } = await consumeRateLimit(`link-preview:${getClientIp(request)}`, 30, 60);
  if (!allowed) {
    return NextResponse.json({ error: 'Trop de requêtes' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const domain = new URL(url).hostname.replace(/^www\./, '');

  // YouTube: extract video ID, get title via noembed (fixed trusted host).
  const ytId = extractYouTubeId(url);
  if (ytId) {
    let title: string | null = null;
    let author: string | null = null;
    try {
      const oembed = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${ytId}`, { signal: AbortSignal.timeout(3000) });
      const data = await oembed.json();
      title = data.title || null;
      author = data.author_name || null;
    } catch { /* noembed failed, continue without title */ }

    return NextResponse.json(
      {
        url,
        title: title ? (author ? `${title} — ${author}` : title) : null,
        description: author || null,
        image: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
        domain: 'youtube.com',
      },
      { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } },
    );
  }

  const res = await safeFetch(url, {
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_HTML_SIZE,
    allowedContentTypes: ['text/html', 'application/xhtml+xml'],
    headers: {
      'User-Agent': `Mozilla/5.0 (compatible; ZoneNordiquesBot/1.0; +${BRAND.url})`,
      'Accept': 'text/html',
    },
  });

  if (!res) {
    // Blocked target, timeout or too many redirects — degrade to a bare card.
    return NextResponse.json({ url, title: null, description: null, image: null, domain });
  }
  if (!res.ok) {
    return NextResponse.json({ error: 'Fetch failed' }, { status: 502 });
  }
  if (!res.text) {
    // Non-HTML content-type: nothing to parse.
    return NextResponse.json({ url, title: null, description: null, image: null, domain });
  }

  const truncated = res.text;
  const title = extractMeta(truncated, 'og:title') || extractMeta(truncated, 'twitter:title') || extractTag(truncated, 'title');
  const description = extractMeta(truncated, 'og:description') || extractMeta(truncated, 'twitter:description') || extractMeta(truncated, 'description');
  const image = extractMeta(truncated, 'og:image') || extractMeta(truncated, 'twitter:image');

  return NextResponse.json(
    { url, title: title?.slice(0, 200) || null, description: description?.slice(0, 300) || null, image: image || null, domain },
    { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } },
  );
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const match = url.match(p);
    if (match) return match[1];
  }
  return null;
}

function extractMeta(html: string, property: string): string | null {
  const propRegex = new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i');
  const propMatch = html.match(propRegex);
  if (propMatch) return decodeHtmlEntities(propMatch[1]);

  const revRegex = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, 'i');
  const revMatch = html.match(revRegex);
  if (revMatch) return decodeHtmlEntities(revMatch[1]);

  const nameRegex = new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']+)["']`, 'i');
  const nameMatch = html.match(nameRegex);
  if (nameMatch) return decodeHtmlEntities(nameMatch[1]);

  const revNameRegex = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["']${property}["']`, 'i');
  const revNameMatch = html.match(revNameRegex);
  if (revNameMatch) return decodeHtmlEntities(revNameMatch[1]);

  return null;
}

function extractTag(html: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i');
  const match = html.match(regex);
  return match ? decodeHtmlEntities(match[1].trim()) : null;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}
