/**
 * Single source of truth for everything brand-specific.
 *
 * Every value can be overridden per deployment via NEXT_PUBLIC_BRAND_* env
 * vars, defaulting to Zone Nordiques. Running this same codebase as another
 * brand (e.g. Zone Expos on zoneexpos.com) is just a matter of setting those
 * env vars on that Vercel project — no code fork.
 *
 * Next.js only inlines NEXT_PUBLIC_* when referenced as the literal text
 * `process.env.NEXT_PUBLIC_…`, so each var is spelled out below (never alias
 * process.env, or the client bundle gets `undefined`).
 *
 * Colours: the hex values here feed server-side rendering that can't use
 * Tailwind (generated OG images, meter needles). The Tailwind `brand-*`
 * utilities read matching CSS variables set from these same values at the
 * document root, so a colour override reaches both surfaces.
 *
 * The brand name shown in chrome (Header/Footer) also comes from i18n
 * `brand.*` keys — keep those loosely in sync with `name` / `nameEn`.
 */

/** Trimmed env value, or the fallback when unset/blank. */
function s(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback;
}

/**
 * Same as `s()` for colours, but tolerates a hex value written without the
 * leading '#'.
 *
 * Deployment configs travel through .env-shaped text more often than not —
 * a pasted block in the Vercel dashboard, a `vercel env pull`, a compose
 * file. In that syntax '#' opens a comment, so `COLOR=#0B3D2E` silently
 * becomes an empty value and the brand quietly renders in another brand's
 * colours. That happened on the CFL Québec deployment and is invisible
 * until someone eyeballs the site, because falling back is not an error.
 *
 * Accepting a bare `0B3D2E` removes the hazard without weakening anything:
 * a 3/6/8-digit hex body is unambiguous, and any other shape is passed
 * through untouched so named colours and rgb()/oklch() still work.
 */
function color(value: string | undefined, fallback: string): string {
  const v = s(value, fallback);
  return /^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(v) ? `#${v}` : v;
}

const domain = s(process.env.NEXT_PUBLIC_BRAND_DOMAIN, 'zonenordiques.com');
const url = s(process.env.NEXT_PUBLIC_BRAND_URL, `https://${domain}`);
const name = s(process.env.NEXT_PUBLIC_BRAND_NAME, 'Zone Nordiques');
const logoPng = s(process.env.NEXT_PUBLIC_BRAND_LOGO_PNG, '/images/zonenordiques.png');
const twitterHandle = s(process.env.NEXT_PUBLIC_BRAND_TWITTER, '@zonenordiques');

export const BRAND = {
  id: s(process.env.NEXT_PUBLIC_BRAND_ID, 'zonenordiques'),

  name,
  nameEn: s(process.env.NEXT_PUBLIC_BRAND_NAME_EN, name),
  shortName: s(process.env.NEXT_PUBLIC_BRAND_SHORT_NAME, 'ZN'),
  tagline: s(process.env.NEXT_PUBLIC_BRAND_TAGLINE, "L'antichambre du hockey"),
  // Podcast section label (shown on the podcast social card badge). Hockey pun
  // by default; a non-hockey brand overrides it (e.g. Zone Expos → 'Balado').
  podcastLabel: s(process.env.NEXT_PUBLIC_BRAND_PODCAST_LABEL, 'Puckcast'),

  domain,
  url,

  // In-app <img> uses the WebP (lightest); social cards + JSON-LD use the PNG
  // (X/Twitter doesn't reliably render WebP og:images).
  logo: s(process.env.NEXT_PUBLIC_BRAND_LOGO, '/images/zonenordiques.webp'),
  logoUrl: s(process.env.NEXT_PUBLIC_BRAND_LOGO_URL, `${url}${logoPng}`),
  // Relative path to the brand PNG — used as the favicon / apple-touch-icon
  // (a static file, so it isn't intercepted by the i18n middleware the way a
  // dynamic /icon route is).
  logoPngPath: logoPng,
  logoWidth: Number(s(process.env.NEXT_PUBLIC_BRAND_LOGO_WIDTH, '512')),
  logoHeight: Number(s(process.env.NEXT_PUBLIC_BRAND_LOGO_HEIGHT, '512')),

  // Contact — the single public address (also the Resend sender).
  email: s(process.env.NEXT_PUBLIC_BRAND_EMAIL, 'info@zonenordiques.com'),

  twitterHandle,
  twitterUrl: s(process.env.NEXT_PUBLIC_BRAND_TWITTER_URL, `https://x.com/${twitterHandle.replace(/^@/, '')}`),

  // Hashtags appended to social shares (no leading '#'), comma-separated in env.
  hashtags: s(process.env.NEXT_PUBLIC_BRAND_HASHTAGS, 'Nordiques,LNH,Hockey')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean),

  // Keys stay blue/orange for legacy call sites; values are the brand's
  // primary / accent colours (Expos would set its own hexes via env).
  colors: {
    blue: color(process.env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY, '#003E7E'),
    blueDark: color(process.env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY_DARK, '#002B57'),
    blueLight: color(process.env.NEXT_PUBLIC_BRAND_COLOR_PRIMARY_LIGHT, '#6CACE4'),
    orange: color(process.env.NEXT_PUBLIC_BRAND_COLOR_ACCENT, '#E4002B'),
    orangeDark: color(process.env.NEXT_PUBLIC_BRAND_COLOR_ACCENT_DARK, '#B8001F'),
    orangeLight: color(process.env.NEXT_PUBLIC_BRAND_COLOR_ACCENT_LIGHT, '#F04A5F'),
    white: '#FFFFFF',
    background: color(process.env.NEXT_PUBLIC_BRAND_COLOR_BACKGROUND, '#F7FAFC'),
  },
} as const;
