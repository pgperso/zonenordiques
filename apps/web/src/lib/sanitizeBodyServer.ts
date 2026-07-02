import 'server-only';
import sanitizeHtml from 'sanitize-html';

// Render-time sanitizer for article bodies, used by the article server
// component to clean stored HTML before it is rendered.
//
// Why not reuse sanitizeArticleHtml? That helper is backed by
// isomorphic-dompurify, which needs jsdom on the server. jsdom isn't reliably
// traced into the article page's serverless function on Vercel, so calling it
// during the page render threw and took the whole route down (500). sanitize-html
// is pure JavaScript with no DOM/jsdom dependency, so it runs anywhere.
//
// The allowlist mirrors sanitizeArticleHtml (the editor grammar: TipTap
// StarterKit + Image + Link), so already-persisted bodies pass through
// unchanged and legacy/imported HTML is still cleaned defensively.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'h2', 'h3', 'h4',
    'strong', 'em', 'u', 's',
    'ul', 'ol', 'li',
    'blockquote', 'code', 'pre',
    'a', 'img',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  // Disallowed tags are dropped but their text content is kept (default),
  // except true non-text tags like <script>/<style> which are removed whole.
};

export function sanitizeArticleBody(dirty: string): string {
  return sanitizeHtml(dirty, OPTIONS);
}
