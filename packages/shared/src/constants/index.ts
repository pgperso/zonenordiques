export { ROLES, PERMISSIONS, ROLE_DISPLAY_NAMES } from './roles';
export { RESTRICTION_TYPES, RESTRICTION_DISPLAY_NAMES } from './restrictions';

export const CHAT_MAX_MESSAGE_LENGTH = 5000;

// Bot user
export const BOT_MEMBER_ID = '00000000-0000-0000-0000-000000000001';

// Feed constants
export const FEED_INITIAL_LIMIT = 50;
export const FEED_LOAD_MORE_LIMIT = 20;
export const MAX_IMAGES_PER_MESSAGE = 4;
export const IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
export const IMAGE_MAX_DIMENSION = 1920;
export const IMAGE_THUMB_DIMENSION = 400;

// Community constants
export const MAX_COMMUNITIES_PER_USER = 50;

// Member rank thresholds
export const MEMBER_RANKS = [
  { min: 0, label: 'Recrue', color: 'text-gray-500', bg: 'bg-gray-100 text-gray-600' },
  { min: 25, label: 'Régulier', color: 'text-blue-600', bg: 'bg-blue-100 text-blue-700' },
  { min: 100, label: 'Vétéran', color: 'text-purple-600', bg: 'bg-purple-100 text-purple-700' },
  { min: 250, label: 'Légende', color: 'text-brand-orange', bg: 'bg-orange-100 text-orange-700' },
] as const;

export function getMemberRank(messageCount: number) {
  for (let i = MEMBER_RANKS.length - 1; i >= 0; i--) {
    if (messageCount >= MEMBER_RANKS[i].min) return MEMBER_RANKS[i];
  }
  return MEMBER_RANKS[0];
}

// Ad constants
export const FEED_AD_INTERVAL = 25;
export const ARTICLE_AD_WORD_THRESHOLD = 300;
export const ADSENSE_CLIENT_ID = 'ca-pub-6197042745925907';

// Google Analytics 4 Measurement ID. GA4 shares the same gtag/dataLayer and
// Consent Mode v2 defaults set by AdSenseLoader, so no consent is duplicated.
export const GA_MEASUREMENT_ID = 'G-R1BWXR3RGW';

// Content-age gate for the press gallery, RSS, sitemap and related-article
// surfaces. On Fan Tribune this date excluded the legacy Zone Nordiques
// archive (already canonical at zonenordiques.com) to avoid duplicate-scraper
// "low value content" AdSense flags.
//
// On zonenordiques.com itself that archive IS the site's canonical content,
// so the date gate is effectively disabled (epoch): every published article
// flows through the gallery/feed/sitemap. Indexing quality is still governed
// by MIN_QUALITY_WORD_COUNT below (short articles stay noindex), which keeps
// the AdSense quality ratio healthy without hiding the archive from readers.
export const ORIGINAL_CONTENT_CUTOFF = '1970-01-01T00:00:00Z';

// Minimum word count for an article to be considered high-quality enough
// for indexing. Below this threshold Google tends to file articles under
// "Crawled, currently not indexed" (judged as low value). Keeping these
// out of the index improves the perceived quality ratio of the site for
// AdSense reviewers.
export const MIN_QUALITY_WORD_COUNT = 500;

export function isOriginalArticle(publishedAt: string | null | undefined): boolean {
  if (!publishedAt) return false;
  return publishedAt >= ORIGINAL_CONTENT_CUTOFF;
}

export function countWords(htmlBody: string | null | undefined): number {
  if (!htmlBody) return 0;
  const text = htmlBody.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ');
  const words = text.split(/\s+/).filter(Boolean);
  return words.length;
}

export function isIndexableArticle(
  publishedAt: string | null | undefined,
  body: string | null | undefined,
): boolean {
  return isOriginalArticle(publishedAt) && countWords(body) >= MIN_QUALITY_WORD_COUNT;
}
