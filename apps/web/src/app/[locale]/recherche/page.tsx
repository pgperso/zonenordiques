import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import { formatDate } from '@arena/shared';
import { BRAND } from '@/lib/brand';
import { SearchBox } from './SearchBox';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'search' });
  // Internal search-result pages are kept out of the index (thin/duplicate),
  // but the sitelinks search box (WebSite SearchAction) still points here.
  return { title: `${t('title')} | ${BRAND.name}`, robots: { index: false, follow: true } };
}

interface ArticleResult {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  published_at: string | null;
  communities: { slug: string } | null;
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('search');

  const sp = await searchParams;
  const q = (typeof sp.q === 'string' ? sp.q : '').trim();

  let results: ArticleResult[] = [];
  if (q.length >= 2) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('articles')
      .select('id, title, slug, excerpt, cover_image_url, published_at, communities!inner(slug)')
      .eq('is_published', true)
      .eq('is_removed', false)
      .textSearch('fts', q, { type: 'websearch', config: 'french' })
      .order('published_at', { ascending: false })
      .limit(30);
    results = (data ?? []) as unknown as ArticleResult[];
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-gray-900 dark:text-gray-100">{t('title')}</h1>
      <SearchBox initialQuery={q} placeholder={t('placeholder')} />

      {q.length < 2 ? (
        <p className="mt-6 text-sm text-gray-400">{t('hint')}</p>
      ) : results.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">{t('noResults', { query: q })}</p>
      ) : (
        <>
          <p className="mb-2 mt-5 text-sm text-gray-500 dark:text-gray-400">
            {t('resultsCount', { count: results.length, query: q })}
          </p>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {results.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/tribunes/${a.communities?.slug ?? 'zone-nordiques'}/articles/${a.slug}`}
                  className="group flex gap-3 py-3"
                >
                  {a.cover_image_url && (
                    <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                      <Image src={a.cover_image_url} alt={a.title} fill className="object-cover" sizes="96px" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="line-clamp-2 text-sm font-semibold text-gray-900 group-hover:text-brand-blue dark:text-gray-100">
                      {a.title}
                    </h2>
                    {a.excerpt && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{a.excerpt}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-gray-400">{formatDate(a.published_at ?? '')}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
