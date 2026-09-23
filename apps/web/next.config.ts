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
