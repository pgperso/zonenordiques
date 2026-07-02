import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import {
  fetchFeaturedItems,
  fetchPressGalleryItems,
} from '@/services/pressGalleryService';
import { PressGalleryClient } from './galerie-de-presse/PressGalleryClient';
import { TopOfWeek } from '@/components/press/TopOfWeek';
import { fetchActivePoll, type Poll } from '@/services/pollService';
import { BRAND } from '@/lib/brand';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pressGallery' });

  const title = `${t('title')} | ${BRAND.name}`;
  const description = t('description');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BRAND.url}/${locale}`,
      siteName: BRAND.name,
      locale: locale === 'fr' ? 'fr_CA' : 'en_CA',
      images: [{ url: BRAND.logoUrl, alt: title, width: BRAND.logoWidth, height: BRAND.logoHeight }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [BRAND.logoUrl],
    },
    alternates: {
      canonical: `${BRAND.url}/${locale}`,
      languages: {
        'fr-CA': `${BRAND.url}/fr`,
        'en-CA': `${BRAND.url}/en`,
        'x-default': `${BRAND.url}/fr`,
      },
    },
    robots: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('pressGallery');
  const supabase = await createClient();

  let featuredItems: Awaited<ReturnType<typeof fetchFeaturedItems>> = [];
  let initialResult: Awaited<ReturnType<typeof fetchPressGalleryItems>> = { items: [], hasMore: false };
  let taverneItems: Awaited<ReturnType<typeof fetchPressGalleryItems>>['items'] = [];
  let communities: { id: number; name: string; name_en: string | null; slug: string; logo_url: string | null }[] = [];
  let activePoll: Poll | null = null;
  let userId: string | null = null;

  try {
    const [featured, communitiesRes, userRes] = await Promise.all([
      fetchFeaturedItems(supabase, locale),
      supabase
        .from('communities')
        .select('id, name, name_en, slug, logo_url')
        .eq('is_active', true)
        .order('name'),
      supabase.auth.getUser(),
    ]);

    featuredItems = featured;
    // name_en / description_en come from migration 00053. Cast through unknown
    // until generated Supabase types are regenerated post-deploy.
    const communitiesRows = (communitiesRes.data ?? []) as unknown as Array<{
      id: number; name: string; name_en: string | null; slug: string; logo_url: string | null;
    }>;
    communities = communitiesRows.map((c) => ({
      id: c.id,
      name: c.name,
      name_en: c.name_en,
      slug: c.slug,
      logo_url: c.logo_url,
    }));
    userId = userRes.data?.user?.id ?? null;

    // Featured items are articles; exclude only their ids from the
    // article query so the hero stories aren't repeated in the feed.
    const excludeArticleIds = featuredItems
      .filter((i) => i.type === 'article')
      .map((i) => i.id);
    const taverne = communities.find((c) => c.slug === 'la-taverne');

    const [mainResult, taverneResult] = await Promise.all([
      fetchPressGalleryItems(supabase, {
        filter: 'all',
        sort: 'latest',
        limit: 12,
        excludeArticleIds,
        locale,
      }),
      taverne
        ? fetchPressGalleryItems(supabase, {
            filter: 'articles',
            sort: 'latest',
            communityId: taverne.id,
            limit: 6,
            locale,
          })
        : Promise.resolve({ items: [], hasMore: false }),
    ]);

    initialResult = mainResult;
    taverneItems = taverneResult.items;

    // Active reader poll for the sidebar — best-effort; a poll failure
    // must never take the home page down.
    activePoll = await fetchActivePoll(supabase).catch(() => null);
  } catch {
    // Graceful degradation: render with empty data
  }

  const title = `${t('title')} | ${BRAND.name}`;
  const description = t('description');
  const items = [...featuredItems, ...initialResult.items];
  const nonce = (await headers()).get('x-nonce') ?? '';

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: title,
      description,
      url: `${BRAND.url}/${locale}`,
      image: BRAND.logoUrl,
      inLanguage: locale === 'fr' ? 'fr-CA' : 'en-CA',
      publisher: {
        '@type': 'Organization',
        name: BRAND.name,
        url: BRAND.url,
        logo: { '@type': 'ImageObject', url: BRAND.logoUrl, width: BRAND.logoWidth, height: BRAND.logoHeight },
      },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: items.map((item, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          url: item.type === 'article'
            ? `${BRAND.url}/${locale}/tribunes/${item.communitySlug}/articles/${item.slug}`
            : `${BRAND.url}/${locale}/tribunes/${item.communitySlug}/podcasts/${item.id}`,
          name: item.title,
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: BRAND.name,
      alternateName: BRAND.nameEn,
      url: `${BRAND.url}/${locale}`,
      inLanguage: locale === 'fr' ? 'fr-CA' : 'en-CA',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${BRAND.url}/${locale}?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PressGalleryClient
        initialItems={initialResult.items}
        initialHasMore={initialResult.hasMore}
        featuredItems={featuredItems}
        taverneItems={taverneItems}
        communities={communities}
        userId={userId}
        poll={activePoll}
        sidebarSlot={<TopOfWeek locale={locale} />}
      />
    </>
  );
}
