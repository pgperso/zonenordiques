// Pure input-sanitization helpers for the AI article pipeline. Extracted from
// the route handler so they can be unit-tested in isolation.

/**
 * Sanitize a free-text field before it is interpolated into a prompt:
 * trims, hard-caps the length, and neutralizes backticks (which could
 * otherwise open/close markdown code fences inside the prompt).
 */
export function sanitizePromptInput(input: string, max: number): string {
  return input
    .trim()
    .slice(0, max)
    .replace(/[`]/g, "'");
}

/**
 * Escape input that goes into a prompt to blunt prompt-injection: collapses
 * fancy/straight double quotes to French guillemets and drops backslashes
 * (which could escape prompt delimiters), then hard-caps the length.
 */
export function escapeForPrompt(input: string, maxLen = 1000): string {
  return input
    .replace(/["“”]/g, '«»')
    .replace(/\\/g, '')
    .slice(0, maxLen);
}

/**
 * Deduplicate news lines by a normalized key: strip a leading [FR]/[EN]
 * language tag, lowercase, and compare on the first 80 characters so
 * near-identical headlines from different feeds collapse to one.
 */
export function deduplicateNews(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.replace(/^\[(FR|EN)\]\s*/i, '').toLowerCase().slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
