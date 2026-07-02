import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { TribuneProvider } from '@/contexts/TribuneContext';
import { AdSenseLoader } from '@/components/ads/AdSenseLoader';
import { CookieConsent } from '@/components/ui/CookieConsent';
import { Toaster } from 'sonner';
import { routing } from '@/i18n/routing';
import { BRAND } from '@/lib/brand';
import { createClient } from '@/lib/supabase/server';
import type { CategoryNavItem } from '@/components/press/CategoryNav';

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: BRAND.name,
    url: BRAND.url,
    logo: BRAND.logoUrl,
    description: 'Plateforme communautaire sportive en direct : chat, articles et podcasts pour les fans de hockey, baseball, football et plus.',
    sameAs: [BRAND.twitterUrl],
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer service', email: BRAND.email },
    foundingDate: '2026',
    sport: ['Hockey', 'Baseball', 'Football', 'Basketball', 'Soccer', 'Golf'],
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: BRAND.name,
    url: BRAND.url,
    inLanguage: ['fr-CA', 'en-CA'],
    potentialAction: {
      '@type': 'SearchAction',
      target: `${BRAND.url}/fr/tribunes/{search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `C'est quoi ${BRAND.name} ?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${BRAND.name} est une plateforme communautaire sportive en direct. Rejoignez des tribunes dédiées à vos équipes favorites pour chatter en temps réel, lire des articles et écouter des podcasts.`,
        },
      },
      {
        '@type': 'Question',
        name: 'Comment rejoindre une tribune sportive ?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Créez un compte gratuit sur ${BRAND.domain}, puis accédez à la liste des tribunes disponibles. Cliquez sur 'Rejoindre' pour intégrer la tribune de votre équipe favorite.`,
        },
      },
      {
        '@type': 'Question',
        name: `Est-ce que ${BRAND.name} est gratuit ?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Oui, ${BRAND.name} est entièrement gratuit. Vous pouvez rejoindre des tribunes, chatter, lire des articles et écouter des podcasts sans frais.`,
        },
      },
    ],
  },
];

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: 'a11y' });
  const nonce = (await headers()).get('x-nonce') ?? '';

  // Sport categories are now part of the global header menu (The Athletic
  // pattern — single bar, all navigation behind it). Fetched once per
  // server render and passed down; the categories table is tiny and
  // already covered by Supabase's HTTP caching.
  const supabase = await createClient();
  const { data: catRes } = await supabase
    .from('categories')
    .select('id, slug, name, name_en')
    .order('sort_order');
  const categories = (catRes ?? []) as unknown as CategoryNavItem[];

  return (
    // suppressHydrationWarning: the bootstrap script in <head> may set the
    // `dark` class on <html> before React hydrates, so React's diff of the
    // root element would otherwise complain about a className mismatch and
    // trip the error boundary.
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="alternate" type="application/rss+xml" title={BRAND.name} href="/feed.xml" />
        <link rel="preconnect" href="https://fjcgfjgqzkswdmazkvlx.supabase.co" />
        <link rel="dns-prefetch" href="https://fjcgfjgqzkswdmazkvlx.supabase.co" />
        <link rel="preconnect" href="https://pagead2.googlesyndication.com" />
        <link rel="dns-prefetch" href="https://pagead2.googlesyndication.com" />
        <AdSenseLoader nonce={nonce} />
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      </head>
      <body className="font-sans antialiased bg-gray-50 text-gray-900 dark:bg-[#1e1e1e] dark:text-gray-100">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-blue focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
        >
          {t('skipToContent')}
        </a>
        <NextIntlClientProvider messages={messages}>
          <TribuneProvider>
            <div className="flex flex-1 min-h-dvh flex-col">
              <Header categories={categories} />
              <main id="main-content" className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</main>
              <Footer />
              <CookieConsent />
            </div>
            <Toaster position="top-center" richColors closeButton />
          </TribuneProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
