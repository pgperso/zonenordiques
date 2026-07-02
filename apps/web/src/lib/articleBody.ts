/**
 * Split sanitized article HTML at the closest </p> after a word threshold,
 * so an in-article ad can be inserted between the two halves.
 *
 * Pure string logic (no DOM / no jsdom) — safe to run in both the server
 * component that pre-renders the body and the client component that displays
 * it. Returns null when the body is too short to bother splitting.
 */
export function splitHtmlAtParagraph(
  html: string,
  wordThreshold: number,
): [string, string] | null {
  const textOnly = html.replace(/<[^>]*>/g, ' ');
  const words = textOnly.trim().split(/\s+/);
  if (words.length < wordThreshold * 1.5) return null; // Not long enough to split

  // Find the Nth word position in the original HTML
  let wordCount = 0;
  let inTag = false;
  let splitSearchStart = 0;

  for (let i = 0; i < html.length; i++) {
    if (html[i] === '<') {
      inTag = true;
      continue;
    }
    if (html[i] === '>') {
      inTag = false;
      continue;
    }
    if (inTag) continue;

    if (/\s/.test(html[i]) && i > 0 && !/\s/.test(html[i - 1])) {
      wordCount++;
      if (wordCount >= wordThreshold) {
        splitSearchStart = i;
        break;
      }
    }
  }

  if (splitSearchStart === 0) return null;

  // Find the next </p> after the threshold
  const closingTag = '</p>';
  const splitIndex = html.indexOf(closingTag, splitSearchStart);
  if (splitIndex === -1) return null;

  const cutPoint = splitIndex + closingTag.length;
  return [html.slice(0, cutPoint), html.slice(cutPoint)];
}
