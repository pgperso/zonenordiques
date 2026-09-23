import { NextResponse } from 'next/server';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent } from 'undici';
import { BRAND } from '@/lib/brand';
import { consumeRateLimit } from '@/lib/rateLimit';
import { getClientIp } from '@/lib/clientIp';

// This route fetches a user-supplied URL server-side, so it must be protected
// against SSRF: we resolve the host and refuse private / loopback / link-local
// (incl. cloud-metadata 169.254.169.254) targets, and we re-validate on every
// redirect hop. It is also rate-limited per IP so it can't be used as an
// anonymous scraping/probing proxy.
export const runtime = 'nodejs';

const TIMEOUT_MS = 5000;
const MAX_HTML_SIZE = 100000; // 100KB max to parse
const MAX_REDIRECTS = 4;

function ipv4ToLong(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const b = Number(p);
    if (!Number.isInteger(b) || b < 0 || b > 255) return null;
    n = n * 256 + b;
  }
  return n >>> 0;
}

/** True for loopback, private (RFC1918), link-local, CGNAT, and IPv6 equivalents. */
function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const n = ipv4ToLong(ip);
    if (n === null) return true; // unparseable → treat as unsafe
    const inRange = (start: string, bits: number) => {
      const s = ipv4ToLong(start)!;
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (s & mask);
    };
    return (
      inRange('0.0.0.0', 8) ||        // this-network
      inRange('10.0.0.0', 8) ||       // private
      inRange('100.64.0.0', 10) ||    // CGNAT
      inRange('127.0.0.0', 8) ||      // loopback
      inRange('169.254.0.0', 16) ||   // link-local (incl. cloud metadata)
      inRange('172.16.0.0', 12) ||    // private
      inRange('192.168.0.0', 16) ||   // private
      inRange('192.0.0.0', 24) ||     // IETF protocol
      n >= ipv4ToLong('224.0.0.0')!   // multicast + reserved
    );
  }
  if (v === 6) {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (lower === '::1' || lower === '::') return true;             // loopback / unspecified
    if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true; // link-local / ULA
    // IPv4-mapped (::ffff:a.b.c.d) → validate the embedded v4
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // not a bare IP → caller resolves DNS first
}

/**
 * Resolve the host to a SINGLE safe IP and reject if it points anywhere
 * internal. Returns the pinned address so the caller connects to exactly the IP
 * we validated — closing the DNS-rebinding TOCTOU where fetch() would otherwise
 * re-resolve the hostname to a different (internal) IP after validation.
 */
async function resolveSafeAddress(hostname: string): Promise<{ address: string; family: number }> {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new Error('blocked host');
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error('blocked ip');
    return { address: host, family: isIP(host) };
  }
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error('blocked resolved ip');
  }
  const first = addrs[0];
  return { address: first.address, family: first.family };
}

/** An undici dispatcher that connects ONLY to the pre-validated IP, whatever the
 *  hostname later resolves to (defeats DNS rebinding). TLS servername stays the
 *  hostname, so certificate validation is unaffected. */
function pinnedDispatcher(address: string, family: number): Agent {
  return new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        if (options && (options as { all?: boolean }).all) {
          (callback as (e: Error | null, a: { address: string; family: number }[]) => void)(null, [{ address, family }]);
        } else {
          (callback as (e: Error | null, a: string, f: number) => void)(null, address, family);
        }
      },
    },
  });
}

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

  const dispatchers: Agent[] = [];
  try {
    // Follow redirects manually, validating the host on every hop (a public URL
    // could 3xx-redirect to an internal one) and connecting to the exact IP we
    // validated (defeats DNS rebinding).
    let current = url;
    let response: Response | null = null;
    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
      const target = new URL(current);
      if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
      }
      const { address, family } = await resolveSafeAddress(target.hostname);
      const dispatcher = pinnedDispatcher(address, family);
      dispatchers.push(dispatcher);

      const res = await fetch(current, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'User-Agent': `Mozilla/5.0 (compatible; ZoneNordiquesBot/1.0; +${BRAND.url})`,
          'Accept': 'text/html',
        },
        redirect: 'manual',
        dispatcher,
      } as RequestInit & { dispatcher: Agent });

      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location')!, current).toString();
        continue;
      }
      response = res;
      break;
    }

    if (!response || !response.ok) {
      return NextResponse.json({ error: 'Fetch failed' }, { status: 502 });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return NextResponse.json({ url, title: null, description: null, image: null, domain: new URL(url).hostname });
    }

    const html = await response.text();
    const truncated = html.slice(0, MAX_HTML_SIZE);

    const title = extractMeta(truncated, 'og:title') || extractMeta(truncated, 'twitter:title') || extractTag(truncated, 'title');
    const description = extractMeta(truncated, 'og:description') || extractMeta(truncated, 'twitter:description') || extractMeta(truncated, 'description');
    const image = extractMeta(truncated, 'og:image') || extractMeta(truncated, 'twitter:image');
    const domain = new URL(url).hostname.replace(/^www\./, '');

    return NextResponse.json(
      { url, title: title?.slice(0, 200) || null, description: description?.slice(0, 300) || null, image: image || null, domain },
      { headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' } },
    );
  } catch {
    return NextResponse.json({ url, title: null, description: null, image: null, domain: new URL(url).hostname.replace(/^www\./, '') });
  } finally {
    for (const d of dispatchers) void d.close().catch(() => {});
  }
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
