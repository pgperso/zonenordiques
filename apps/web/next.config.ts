import type { NextConfig } from "next";
import bundleAnalyzer from '@next/bundle-analyzer';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

// Derive the Supabase Storage host from the public URL instead of hardcoding
// the project ref — keeps dev / staging / prod environments self-configuring.
function supabaseImageHost(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is required to configure next/image remotePatterns',
    );
  }
  return new URL(url).hostname;
}

/**
 * Refuse to build a brand that has not said who it is.
 *
 * Every default in src/lib/brand.ts and src/lib/siteConfig.ts is a Zone
 * Nordiques value, and a missing variable produces no error — the site
 * simply renders as Zone Nordiques. That has already happened twice on the
 * CFL Québec deployment (the colours, then the brand email), and each time
 * it was found by eye rather than by a failure.
 *
 * The consequences of getting this wrong are not cosmetic: BRAND.url feeds
 * every canonical tag, the sitemap, the RSS guids and the JSON-LD @ids, so a
 * blank value makes a whole domain declare itself to be another one.
 *
 * NEXT_PUBLIC_BRAND_ID is required everywhere, because without it we cannot
 * even tell which brand is being built. Once it names a brand other than the
 * default, the values that would otherwise silently fall back to Zone
 * Nordiques become required too.
 */
function assertBrandConfigured(): void {
  const env = (k: string) => process.env[k]?.trim() ?? '';
  const brandId = env('NEXT_PUBLIC_BRAND_ID');

  if (!brandId) {
    // No brand id. If anything else says this is not the hockey brand, the
    // id was forgotten and the build is about to mislabel itself — refuse.
    // Otherwise it is the default brand (or a local dev build), where every
    // fallback is correct: warn so it still shows up in the build log.
    const looksLikeAnotherBrand =
      (env('NEXT_PUBLIC_SITE_CATEGORY') && env('NEXT_PUBLIC_SITE_CATEGORY') !== 'hockey') ||
      (env('NEXT_PUBLIC_BRAND_DOMAIN') && env('NEXT_PUBLIC_BRAND_DOMAIN') !== 'zonenordiques.com');
    if (looksLikeAnotherBrand) {
      throw new Error(
        'NEXT_PUBLIC_BRAND_ID is not set, but other variables describe a brand that is ' +
        'not Zone Nordiques. BRAND.id drives the cross-promo registry, the newsletter ' +
        'brand_id column and the per-brand rate-limit keys, all of which would be ' +
        'attributed to Zone Nordiques. Set NEXT_PUBLIC_BRAND_ID on this project.',
      );
    }
    console.warn(
      '\n[brand] NEXT_PUBLIC_BRAND_ID is not set — building as Zone Nordiques (the default).\n' +
      '        Set it explicitly on every Vercel project so this is a choice, not an accident.\n',
    );
    return;
  }

  if (brandId === 'zonenordiques') return;

  const required = [
    'NEXT_PUBLIC_BRAND_NAME',
    'NEXT_PUBLIC_BRAND_DOMAIN',
    'NEXT_PUBLIC_BRAND_EMAIL',
    'NEXT_PUBLIC_BRAND_LOGO',
    'NEXT_PUBLIC_BRAND_LOGO_PNG',
    'NEXT_PUBLIC_BRAND_TAGLINE',
    'NEXT_PUBLIC_CANONICAL_HOST',
    'NEXT_PUBLIC_SITE_SPORT',
    'NEXT_PUBLIC_SITE_CATEGORY',
    'NEXT_PUBLIC_SITE_LEAGUE',
    'NEXT_PUBLIC_SITE_MAIN_TRIBUNE',
  ];
  const missing = required.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Brand "${brandId}" is missing required environment variables: ${missing.join(', ')}. ` +
      'Each would fall back to a Zone Nordiques value, which is never correct for another brand. ' +
      'Set them on this Vercel project (type Config, not Secret — NEXT_PUBLIC_* must reach the build).',
    );
  }
}

assertBrandConfigured();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: supabaseImageHost(),
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  async headers() {
    return [
      {
        // Static security headers on EVERY path — including the ones the
        // middleware matcher skips (/api/*, /auth/callback, static files, 404s
        // for extension-suffixed paths). The per-request CSP nonce stays in
        // the middleware; these are the nonce-free ones.
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), autoplay=(self)' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
      {
        // Serve ads.txt from a stable CDN cache rather than revalidating
        // against the origin on every hit. AdSense's crawler intermittently
        // reported "not found" because each request previously round-tripped
        // to the origin (max-age=0, must-revalidate) and any blip read as a
        // miss. A cached copy with stale-while-revalidate is always there.
        source: '/ads.txt',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=1800, s-maxage=86400, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(withNextIntl(nextConfig));
