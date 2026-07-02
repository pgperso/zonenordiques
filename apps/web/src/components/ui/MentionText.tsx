import { Fragment } from 'react';

// Same shape the notification triggers parse server-side, so what gets
// highlighted is exactly what notifies.
const MENTION_REGEX = /@([A-Za-z0-9_]{2,30})/g;

/**
 * Renders a plain string with "@username" mentions highlighted. Display
 * only — not every member has a public page, so mentions are not links.
 */
export function MentionText({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <span key={key++} className="font-medium text-brand-blue">
        @{match[1]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return <Fragment>{nodes}</Fragment>;
}
