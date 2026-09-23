import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent } from 'undici';

/**
 * SSRF-safe server-side fetch, shared by every place that fetches a
 * user-supplied URL (link previews, AI research context).
 *
 * - Refuses loopback / private / link-local / CGNAT / metadata targets, for IP
 *   literals AND for hostnames (resolved first).
 * - Connects to EXACTLY the IP that was validated, via an undici dispatcher
 *   whose lookup is pinned — closes the DNS-rebinding TOCTOU where fetch()
 *   would otherwise re-resolve the name to an internal address.
 * - Follows redirects manually and re-validates every hop.
 * - Reads the body as a stream with a hard byte cap.
 */

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

/** True for loopback, private (RFC1918), link-local, CGNAT, multicast/reserved
 *  and their IPv6 equivalents (incl. IPv4-mapped, NAT64 and 6to4 embeddings). */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const n = ipv4ToLong(ip);
    if (n === null) return true;
    const inRange = (start: string, bits: number) => {
      const s = ipv4ToLong(start)!;
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (s & mask);
    };
    return (
      inRange('0.0.0.0', 8) ||
      inRange('10.0.0.0', 8) ||
      inRange('100.64.0.0', 10) ||
      inRange('127.0.0.0', 8) ||
      inRange('169.254.0.0', 16) ||
      inRange('172.16.0.0', 12) ||
      inRange('192.168.0.0', 16) ||
      inRange('192.0.0.0', 24) ||
      n >= ipv4ToLong('224.0.0.0')!
    );
  }
  if (v === 6) {
    const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // IPv4-mapped ::ffff:a.b.c.d
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    // NAT64 (64:ff9b::/96) and 6to4 (2002::/16) embed an IPv4 — validate it.
    if (lower.startsWith('64:ff9b:') || lower.startsWith('2002:')) {
      const embedded = embeddedIpv4(lower);
      return embedded ? isPrivateIp(embedded) : true;
    }
    return false;
  }
  return true; // not a bare IP → caller resolves DNS first
}

/** Best-effort extraction of the IPv4 embedded in a NAT64 / 6to4 address. */
function embeddedIpv4(v6: string): string | null {
  // Expand to 8 hextets.
  const [head, tail = ''] = v6.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const missing = 8 - h.length - t.length;
  if (missing < 0) return null;
  const hextets = [...h, ...Array(missing).fill('0'), ...t].map((x) => parseInt(x || '0', 16));
  if (hextets.length !== 8 || hextets.some((x) => Number.isNaN(x))) return null;
  // NAT64: last 32 bits. 6to4: bits 16..47 (hextets 1-2).
  const [a, b] = v6.startsWith('2002:') ? [hextets[1], hextets[2]] : [hextets[6], hextets[7]];
  return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
}

/**
 * Resolve the host to a SINGLE safe IP and reject if it points anywhere
 * internal. Returns the pinned address so the caller connects to exactly the IP
 * we validated. Throws on block.
 */
export async function resolveSafeAddress(hostname: string): Promise<{ address: string; family: number }> {
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
  return { address: addrs[0].address, family: addrs[0].family };
}

/** An undici dispatcher that connects ONLY to the pre-validated IP. TLS
 *  servername stays the hostname, so certificate validation is unaffected. */
export function pinnedDispatcher(address: string, family: number): Agent {
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

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  /** Hard cap on the body read from the network (bytes). */
  maxBytes?: number;
  headers?: Record<string, string>;
  /** Only accept responses whose content-type starts with one of these. */
  allowedContentTypes?: string[];
}

export interface SafeFetchResult {
  status: number;
  ok: boolean;
  contentType: string;
  /** Body text, truncated to maxBytes. */
  text: string;
  /** Final URL after redirects. */
  url: string;
}

/**
 * Fetch a user-supplied http(s) URL with the SSRF protections above. Returns
 * null when the target is blocked, times out, redirects too much, or the
 * content-type isn't allowed.
 */
export async function safeFetch(inputUrl: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult | null> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxRedirects = opts.maxRedirects ?? 4;
  const maxBytes = opts.maxBytes ?? 200_000;
  const dispatchers: Agent[] = [];

  try {
    let current = inputUrl;
    for (let hop = 0; hop < maxRedirects; hop++) {
      const target = new URL(current);
      if (target.protocol !== 'http:' && target.protocol !== 'https:') return null;
      const { address, family } = await resolveSafeAddress(target.hostname);
      const dispatcher = pinnedDispatcher(address, family);
      dispatchers.push(dispatcher);

      const res = await fetch(current, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: opts.headers,
        redirect: 'manual',
        dispatcher,
      } as RequestInit & { dispatcher: Agent });

      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location')!, current).toString();
        continue;
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (opts.allowedContentTypes && !opts.allowedContentTypes.some((t) => contentType.toLowerCase().startsWith(t))) {
        return { status: res.status, ok: res.ok, contentType, text: '', url: current };
      }

      // Stream the body with a hard byte cap — never `res.text()` an unbounded page.
      let text = '';
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let received = 0;
        while (received < maxBytes) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          text += decoder.decode(value, { stream: true });
        }
        await reader.cancel().catch(() => {});
        text = text.slice(0, maxBytes);
      }
      return { status: res.status, ok: res.ok, contentType, text, url: current };
    }
    return null; // too many redirects
  } catch {
    return null;
  } finally {
    for (const d of dispatchers) void d.close().catch(() => {});
  }
}
