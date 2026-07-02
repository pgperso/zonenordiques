'use client';

import { memo, useMemo } from 'react';
import { isSafeUrl } from '@/lib/url';

interface FeedRichContentProps {
  content: string;
}

// URL regex that matches common patterns
const URL_REGEX = /https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]/g;

// Basic markdown patterns
const BOLD_REGEX = /\*\*(.+?)\*\*/g;
const ITALIC_REGEX = /(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g;

// @mention — highlighted inline. Kept display-only (no link) since not
// every member has a public page.
const MENTION_REGEX = /@([A-Za-z0-9_]{2,30})/g;

function renderMentions(text: string, baseKey: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = baseKey;
  let match;
  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <span key={`mention-${key++}`} className="font-medium text-brand-blue">
        @{match[1]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function parseContent(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  // First, find all URLs
  const urlMatches: { start: number; end: number; url: string }[] = [];
  URL_REGEX.lastIndex = 0;
  let match;
  while ((match = URL_REGEX.exec(text)) !== null) {
    if (isSafeUrl(match[0])) {
      urlMatches.push({ start: match.index, end: match.index + match[0].length, url: match[0] });
    }
  }

  // Process text segments between URLs
  for (const urlMatch of urlMatches) {
    // Add text before URL
    if (urlMatch.start > lastIndex) {
      const segment = text.slice(lastIndex, urlMatch.start);
      nodes.push(...formatText(segment, key));
      key += 10;
    }

    // Add URL link
    nodes.push(
      <a
        key={`link-${key++}`}
        href={urlMatch.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand-blue hover:underline"
      >
        {urlMatch.url}
      </a>,
    );

    lastIndex = urlMatch.end;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const segment = text.slice(lastIndex);
    nodes.push(...formatText(segment, key));
  }

  return nodes;
}

function formatText(text: string, baseKey: number): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let key = baseKey;

  // Replace bold (**text**)
  const parts = text.split(BOLD_REGEX);
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      // Bold content
      nodes.push(<strong key={`bold-${key++}`} className="font-semibold">{parts[i]}</strong>);
    } else {
      // Check for italic within non-bold parts
      const italicParts = parts[i].split(ITALIC_REGEX);
      for (let j = 0; j < italicParts.length; j++) {
        if (j % 2 === 1) {
          nodes.push(<em key={`italic-${key++}`}>{italicParts[j]}</em>);
        } else if (italicParts[j]) {
          nodes.push(...renderMentions(italicParts[j], key));
          key += 50;
        }
      }
    }
  }

  return nodes;
}

export const FeedRichContent = memo(function FeedRichContent({ content }: FeedRichContentProps) {
  const parsed = useMemo(() => {
    const lines = content.split('\n');
    return lines.map((line, i) => (
      <span key={i}>
        {i > 0 && <br />}
        {parseContent(line)}
      </span>
    ));
  }, [content]);

  return (
    <div className="overflow-hidden break-words text-sm text-gray-700 dark:text-gray-300">
      {parsed}
    </div>
  );
});
