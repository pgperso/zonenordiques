/**
 * Single source of truth for everything brand-specific.
 *
 * Every hard-coded brand string in the app (site name, domain, logo,
 * social handle, JSON-LD publisher, OpenGraph defaults) should read
 * from BRAND — never inline a literal. That way relaunching the same
 * codebase under a different brand (e.g. a future "Zone Nordiques")
 * is a matter of swapping this object, not grepping the whole tree.
 *
 * Two things still live outside this file by design:
 *  - Brand colours: defined once in the @theme block of
 *    styles/theme.css and consumed as Tailwind classes (bg-brand-blue,
 *    …). The hex values are mirrored here only for server-side
 *    rendering that can't use Tailwind (generated OG / icon images).
 *  - The brand name shown in chrome (Header/Footer) comes from the
 *    i18n `brand.*` keys so it can differ per locale; keep those in
 *    sync with `name` / `nameEn` below.
 */
export const BRAND = {
  // Stable identifier — handy once more than one brand exists.
  id: 'zonenordiques',

  // Primary (French) brand name.
  name: 'Zone Nordiques',
  // Alternate / English brand name (OpenGraph alternateName, EN copy).
  nameEn: 'Zone Nordiques',
  // Single-glyph short name for the generated favicon/app icon.
  shortName: 'ZN',
  // Tagline rendered on the generated OG / Twitter images.
  tagline: "L'antichambre du hockey",

  // Bare host and full origin.
  domain: 'zonenordiques.com',
  url: 'https://zonenordiques.com',

  // Logo — site-relative path, absolute URL, and intrinsic size.
  logo: '/images/zonenordiques.webp',
  logoUrl: 'https://zonenordiques.com/images/zonenordiques.webp',
  logoWidth: 512,
  logoHeight: 512,

  // Contact — the single public address (also the Resend sender).
  email: 'info@zonenordiques.com',

  // Social.
  twitterHandle: '@zonenordiques',
  twitterUrl: 'https://x.com/zonenordiques',

  // Default hashtags appended to social shares (no leading '#').
  hashtags: ['Nordiques', 'LNH', 'Hockey'],

  colors: {
    blue: '#003E7E',
    blueDark: '#002B57',
    blueLight: '#6CACE4',
    orange: '#E4002B',
    orangeLight: '#F04A5F',
    white: '#FFFFFF',
    background: '#F7FAFC',
  },
} as const;
