import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { displayCommunityName, displayCommunityDescription } from '@arena/shared';
import { fetchPressGalleryItems } from '@/services/pressGalleryService';
import { PressContentCard } from '@/components/press/PressContentCard';
import { BRAND } from '@/lib/brand';

export const revalidate = 300;

interface CategoryPageProps {
  params: Promise<{ locale: string; category: string }>;
}

type CategoryRow = {
  id: number;
  name: string;
  name_en: string | null;
  slug: string;
  icon: string | null;
};

type CommunityRow = {
  id: number;
  name: string;
  name_en: string | null;
  slug: string;
  description: string | null;
  description_en: string | null;
  logo_url: string | null;
  member_count: number;
};

function displayCategoryName(category: CategoryRow, locale: string): string {
  if (locale === 'en' && category.name_en) return category.name_en;
  return category.name;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { locale, category: categorySlug } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from('categories')
    .select('name, name_en, slug')
    .eq('slug', categorySlug)
    .single();

  if (!data) return { title: 'Catégorie introuvable', robots: { index: false, follow: false } };

  const cat = data as unknown as CategoryRow;
  const name = displayCategoryName(cat, locale);
  const isFr = locale === 'fr';
  const title = isFr
    ? `${name} — Actualités, analyses et tribunes | ${BRAND.name}`
    : `${name} — News, analysis and tribunes | ${BRAND.nameEn}`;
  const description = isFr
    ? `Tout sur le ${name.toLowerCase()} au Québec et au Canada : actualités, chroniques, podcasts, débats et tribunes communautaires.`
    : `Everything ${name}: news, columns, podcasts, debates and community tribunes from Quebec and Canada.`;
  const url = `${BRAND.url}/${locale}/sport/${categorySlug}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url,
      siteName: BRAND.name,
      locale: isFr ? 'fr_CA' : 'en_CA',
      images: [{ url: BRAND.logoUrl, alt: name, width: BRAND.logoWidth, height: BRAND.logoHeight }],
    },
    twitter: { card: 'summary_large_image', title, description },
    alternates: {
      canonical: url,
      languages: {
        'fr-CA': `${BRAND.url}/fr/sport/${categorySlug}`,
        'en-CA': `${BRAND.url}/en/sport/${categorySlug}`,
        'x-default': `${BRAND.url}/fr/sport/${categorySlug}`,
      },
    },
    robots: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' },
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { locale, category: categorySlug } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();

  // Load the category
  const { data: catData } = await supabase
    .from('categories')
    .select('id, name, name_en, slug, icon')
    .eq('slug', categorySlug)
    .single();

  const category = catData as unknown as CategoryRow | null;
  if (!category) notFound();

  // Communities (tribunes) inside this sport category — sport-to-sport
  // navigation now lives in the global header dropdown rather than in a
  // separate strip on this page.
  const { data: comData } = await supabase
    .from('communities')
    .select('id, name, name_en, slug, description, description_en, logo_url, member_count')
    .eq('category_id', category.id)
    .eq('is_active', true)
    .order('member_count', { ascending: false });

  const communities = (comData ?? []) as unknown as CommunityRow[];
  const communityIds = communities.map((c) => c.id);

  // Articles across every tribune in this category, via the shared
  // gallery service so the filtering (published, not removed, original-
  // content cutoff) and the card rendering stay identical to the home
  // gallery — one code path, no drift.
  const articles =
    communityIds.length > 0
      ? (
          await fetchPressGalleryItems(supabase, {
            filter: 'articles',
            sort: 'latest',
            communityIds,
            limit: 30,
            locale,
          })
        ).items
      : [];

  const categoryName = displayCategoryName(category, locale);
  const isFr = locale === 'fr';
  const url = `${BRAND.url}/${locale}/sport/${categorySlug}`;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': url,
      name: `${categoryName} | ${BRAND.name}`,
      description: isFr
        ? `Actualités et tribunes ${categoryName} sur ${BRAND.name}.`
        : `${categoryName} news and tribunes on ${BRAND.nameEn}.`,
      url,
      inLanguage: isFr ? 'fr-CA' : 'en-CA',
      publisher: {
        '@type': 'NewsMediaOrganization',
        name: BRAND.name,
        url: BRAND.url,
        logo: { '@type': 'ImageObject', url: BRAND.logoUrl, width: BRAND.logoWidth, height: BRAND.logoHeight },
      },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: articles.map((a, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          url: `${BRAND.url}/${locale}/tribunes/${a.communitySlug}/articles/${a.slug}`,
          name: a.title,
        })),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: isFr ? 'Accueil' : 'Home', item: `${BRAND.url}/${locale}` },
        { '@type': 'ListItem', position: 2, name: categoryName, item: url },
      ],
    },
  ];

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto bg-white dark:bg-[#1e1e1e]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:py-8">
        {/* Header */}
        <header className="mb-8 border-b border-gray-200 dark:border-gray-700 pb-6">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {isFr ? 'Catégorie' : 'Category'}
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 md:text-4xl">
            {categoryName}
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 md:text-base">
            {isFr
              ? `${articles.length} article${articles.length > 1 ? 's' : ''} · ${communities.length} tribune${communities.length > 1 ? 's' : ''}`
              : `${articles.length} article${articles.length > 1 ? 's' : ''} · ${communities.length} tribune${communities.length > 1 ? 's' : ''}`}
          </p>
        </header>

        {/* Articles first — readers landing on a category page came for
            content, not for the directory of tribunes. The tribunes block
            stays on the page (good for internal linking + SEO) but moves
            below the article grid. */}
        <section className="mb-12">
          <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-gray-100">
            {isFr ? 'Derniers articles' : 'Latest articles'}
          </h2>

          {articles.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              {isFr
                ? 'Aucun article publié pour le moment dans cette catégorie. Revenez bientôt — de nouvelles chroniques arrivent chaque semaine.'
                : 'No articles published in this category yet. Check back soon — new columns arrive every week.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((a) => (
                <PressContentCard key={`${a.type}-${a.id}`} item={a} />
              ))}
            </div>
          )}
        </section>

        {/* Tribunes in this category — moved to the bottom so the article
            feed leads, with the directory acting as a "what's next" footer. */}
        {communities.length > 0 && (
          <section className="border-t border-gray-200 dark:border-gray-700 pt-8">
            <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-gray-100">
              {isFr ? 'Tribunes' : 'Tribunes'}
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {communities.map((c) => {
                const cName = displayCommunityName(c, locale);
                const cDesc = displayCommunityDescription(c, locale);
                return (
                  <li key={c.id}>
                    <Link
                      href={`/tribunes/${c.slug}`}
                      className="group flex h-full flex-col gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] p-3 transition hover:border-brand-blue/40 hover:shadow-md"
                    >
                      <div className="flex items-center gap-2">
                        {c.logo_url ? (
                          <Image
                            src={c.logo_url}
                            alt={cName}
                            width={32}
                            height={32}
                            className="h-8 w-8 shrink-0 rounded object-contain"
                          />
                        ) : (
                          <div className="h-8 w-8 shrink-0 rounded bg-gray-200 dark:bg-gray-700" />
                        )}
                        <span className="truncate text-sm font-semibold text-gray-900 group-hover:text-brand-blue dark:text-gray-100">
                          {cName}
                        </span>
                      </div>
                      {cDesc && (
                        <p className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                          {cDesc}
                        </p>
                      )}
                      <p className="mt-auto text-[11px] text-gray-400">
                        {c.member_count.toLocaleString(isFr ? 'fr-CA' : 'en-CA')} {isFr ? 'membres' : 'members'}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
