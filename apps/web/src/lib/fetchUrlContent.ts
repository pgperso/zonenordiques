import { safeFetch } from './safeFetch';

/**
 * Fetch the text content of a URL for use as AI research context.
 * Extracts readable text from HTML, strips tags/scripts/styles.
 * Returns null on failure. Truncates to maxChars.
 *
 * Security: the URL comes from the author's directives, so this goes through
 * safeFetch — private/internal targets and DNS rebinding are refused, redirects
 * are re-validated per hop, and the body is read with a hard byte cap.
 */
export async function fetchUrlContent(url: string, maxChars = 3000): Promise<string | null> {
  const res = await safeFetch(url, {
    timeoutMs: 8000,
    maxBytes: 200_000,
    allowedContentTypes: ['text/html', 'application/xhtml+xml', 'text/plain'],
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,text/plain',
    },
  });
  if (!res || !res.ok || !res.text) return null;

  // Strip scripts, styles, and HTML tags
  const text = res.text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length < 50) return null;
  return text.slice(0, maxChars);
}

/** Extract URLs from a text string */
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s,;)}\]"'<>]+/g;
  return [...new Set(text.match(urlRegex) ?? [])];
}
