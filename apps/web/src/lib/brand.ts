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
  id: 'fanstribune',

  // Primary (French) brand name.
  name: 'La tribune des fans',
  // Alternate / English brand name (OpenGraph alternateName, EN copy).
  nameEn: 'Fans Tribune',
  // Single-glyph short name for the generated favicon/app icon.
  shortName: 'LT',
  // Tagline rendered on the generated OG / Twitter images.
  tagline: 'Vos tribunes, votre opinion',

  // Bare host and full origin.
  domain: 'fanstribune.com',
  url: 'https://fanstribune.com',

  // Logo — site-relative path, absolute URL, and intrinsic size.
  logo: '/images/fanstribune.webp',
  logoUrl: 'https://fanstribune.com/images/fanstribune.webp',
  logoWidth: 512,
  logoHeight: 512,

  // Contact — the single public address (also the Resend sender).
  email: 'info@fanstribune.com',

  // Social.
  twitterHandle: '@fanstribune',
  twitterUrl: 'https://x.com/fanstribune',

  colors: {
    blue: '#0B4870',
    blueDark: '#083A5A',
    blueLight: '#1969B4',
    orange: '#E67E22',
    orangeLight: '#F39C12',
    white: '#FFFFFF',
    background: '#F9FAFB',
  },
} as const;
