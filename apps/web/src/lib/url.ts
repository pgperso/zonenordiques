const SAFE_PROTOCOLS = /^https?:|^mailto:/i;

export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return SAFE_PROTOCOLS.test(parsed.protocol);
  } catch {
    return false;
  }
}
