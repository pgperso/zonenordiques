import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

// Brand-aware PWA manifest. A STATIC manifest.json would install the same app
// (name + icons) on every brand — e.g. installing from zoneexpos.com gave a
// "Zone Nordiques" app. Generating it from BRAND (env-driven per deployment)
// means each site installs as itself.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} - Communauté des fans`,
    short_name: BRAND.name,
    description: `Chat en direct, articles et commentaires de la communauté ${BRAND.name}`,
    start_url: '/',
    display: 'standalone',
    background_color: BRAND.colors.background,
    theme_color: BRAND.colors.blue,
    orientation: 'portrait-primary',
    categories: ['sports', 'social'],
    icons: [
      { src: BRAND.logoPngPath, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: BRAND.logo, sizes: '192x192', type: 'image/webp', purpose: 'any' },
    ],
  };
}
