import DOMPurify from 'isomorphic-dompurify';

// Server-side sanitization of AI-generated article HTML before it reaches the
// client or gets persisted. Strict allowlist matching the editor's grammar
// (TipTap StarterKit + Image + Link). Anything outside this set is stripped.

const ALLOWED_TAGS = [
  'p', 'br', 'h2', 'h3', 'h4',
  'strong', 'em', 'u', 's',
  'ul', 'ol', 'li',
  'blockquote', 'code', 'pre',
  'a', 'img',
];

const ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'src', 'alt', 'width', 'height'];

export function sanitizeArticleHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/)/i,
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
    KEEP_CONTENT: true,
  });
}

// Strips all HTML for short text fields (title, excerpt) that must remain plain.
export function sanitizeArticleText(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
