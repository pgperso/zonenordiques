import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { BRAND } from '@/lib/brand';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: {
    default: `${BRAND.name} - Sports, actualités et plein d'autres patentes`,
    template: `%s | ${BRAND.name}`,
  },
  description:
    `${BRAND.name} : sports, actualités et plein d'autres patentes. Articles d'opinion, podcasts, chat en direct et débats. La communauté #1 des fans au Québec.`,
  keywords: [
    'tribune sportive', 'chat sport en direct', 'communauté fans hockey',
    'forum hockey', 'forum baseball', 'forum football', 'forum golf', 'PGA Tour fans',
    'Canadiens de Montréal fans', 'Blue Jays fans', 'CF Montréal fans',
    'opinion sportive', 'chronique sport', 'podcast sport québec',
    'article hockey', 'débat sportif', 'chat fans sport',
    'actualité québec', 'opinion politique', 'chronique actualité',
    BRAND.name, BRAND.domain.split('.')[0],
    'sports community', 'live sports chat', 'sports fan forum',
  ],
  authors: [{ name: BRAND.name, url: BRAND.url }],
  creator: BRAND.name,
  publisher: BRAND.name,
  openGraph: {
    type: 'website',
    locale: 'fr_CA',
    alternateLocale: 'en_CA',
    siteName: BRAND.name,
    title: `${BRAND.name} - Sports, actualités et plein d'autres patentes`,
    description:
      'Articles d\'opinion, podcasts, chat en direct et débats. Sports, actualités et plein d\'autres patentes.',
    images: [{ url: BRAND.logo, width: BRAND.logoWidth, height: BRAND.logoHeight, alt: BRAND.name }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} - Sports, actualités et plein d'autres patentes`,
    description:
      'Articles d\'opinion, podcasts, chat en direct et débats. Sports, actualités et plein d\'autres patentes.',
    images: [BRAND.logo],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  // The PWA manifest is generated per-brand by app/manifest.ts (Next auto-links
  // /manifest.webmanifest), so each site installs as itself.
  // Per-brand favicon: the brand's own static PNG (Zone Nordiques → ZN,
  // Zone Expos → ZE). A static file rather than a dynamic /icon route, which
  // the i18n middleware would otherwise rewrite to a locale path.
  icons: {
    icon: [{ url: BRAND.logoPngPath, type: 'image/png' }],
    shortcut: [{ url: BRAND.logoPngPath, type: 'image/png' }],
    apple: [{ url: BRAND.logoPngPath, type: 'image/png' }],
  },
  alternates: {
    canonical: BRAND.url,
    languages: {
      'fr-CA': `${BRAND.url}/fr`,
      'en-CA': `${BRAND.url}/en`,
    },
  },
  category: 'sports',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
