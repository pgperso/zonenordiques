import { BRAND } from '@/lib/brand';
import { safeFetch } from '@/lib/safeFetch';

/** Open Graph-style card for a URL. */
export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  domain: string;
}

const TIMEOUT_MS = 5000;
const MAX_HTML_SIZE = 100000; // 100KB max to parse

/**
 * Build a preview card for a user-supplied URL, server-side only.
 * Goes through safeFetch (SSRF-safe: private/internal targets refused, DNS
 * rebinding defeated by IP pinning, redirects re-validated, body capped).
 * Returns null when the URL is unusable; a bare card (no title/image) when the
 * target is reachable but yields nothing to show.
 */
export async function buildLinkPreview(url: string): Promise<LinkPreview | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  let domain: string;
  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }

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
    return {
      url,
      title: title ? (author ? `${title} — ${author}` : title) : null,
      description: author || null,
      image: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      domain: 'youtube.com',
    };
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
  if (!res || !res.ok) return { url, title: null, description: null, image: null, domain };
  if (!res.text) return { url, title: null, description: null, image: null, domain };

  const html = res.text;
  const title = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title') || extractTag(html, 'title');
  const description = extractMeta(html, 'og:description') || extractMeta(html, 'twitter:description') || extractMeta(html, 'description');
  const image = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image');

  return {
    url,
    title: title?.slice(0, 200) || null,
    description: description?.slice(0, 300) || null,
    image: image && /^https?:\/\//i.test(image) ? image : null,
    domain,
  };
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
