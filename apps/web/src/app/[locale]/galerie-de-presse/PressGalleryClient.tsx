'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSupabase } from '@/hooks/useSupabase';
import { HeroSection } from '@/components/press/HeroSection';
import { PressFilterBar } from '@/components/press/PressFilterBar';
import { PressContentCard } from '@/components/press/PressContentCard';
import { PollBlock } from '@/components/press/PollBlock';
import { MetreCards } from '@/components/press/MetreCards';
import { AdBanner } from '@/components/ads/AdBanner';
import { AdSlot } from '@/components/ads/AdSlot';
import {
  fetchPressGalleryItems,
  type PressGalleryItem,
} from '@/services/pressGalleryService';
import type { Poll } from '@/services/pollService';
import { Link } from '@/i18n/navigation';

type FilterType = 'all' | 'articles' | 'podcasts';
type SortType = 'latest' | 'trending';

interface Community {
  id: number;
  name: string;
  name_en: string | null;
  slug: string;
  logo_url: string | null;
}

interface PressGalleryClientProps {
  initialItems: PressGalleryItem[];
  initialHasMore: boolean;
  featuredItems: PressGalleryItem[];
  taverneItems: PressGalleryItem[];
  communities: Community[];
  userId: string | null;
  // Active reader poll, rendered at the top of the sidebar above the
  // "Top of the week" widget. Null when no poll is active.
  poll: Poll | null;
  // Server-rendered sidebar content (e.g. "Top of the week"). Rendered
  // above the persistent sidebar ad on desktop so the SSR HTML carries
  // crawlable links to popular articles. Hidden on mobile where the
  // sidebar collapses.
  sidebarSlot?: React.ReactNode;
}

const PAGE_SIZE = 12;

// Pattern: 2 large cards, then 6 standard (3-col), then ad, repeat
const PATTERN_SIZE = 8;
const FEATURE_DUO_SIZE = 2;

export function PressGalleryClient({
  initialItems,
  initialHasMore,
  featuredItems,
  taverneItems,
  communities,
  poll,
  sidebarSlot,
}: PressGalleryClientProps) {
  const t = useTranslations('pressGallery');
  const tPool = useTranslations('pool');
  const supabase = useSupabase();
  const locale = useLocale();

  // Featured items are articles; exclude only their ids from the
  // article query (podcasts are a separate id space — see BUG 3 fix).
  const heroArticleIds = useMemo(
    () => featuredItems.filter((i) => i.type === 'article').map((i) => i.id),
    [featuredItems],
  );

  const [items, setItems] = useState<PressGalleryItem[]>(initialItems);
  const [offset, setOffset] = useState(initialItems.length);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [filter, setFilter] = useState<FilterType>('all');
  const [sort, setSort] = useState<SortType>('latest');
  const [communityId, setCommunityId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  // heroMode is computed after visibleFeatured (below)

  // Filter featured items to match the current type filter.
  const visibleFeatured = useMemo(() => {
    let items = featuredItems;
    if (filter === 'articles') items = items.filter((i) => i.type === 'article');
    if (filter === 'podcasts') items = items.filter((i) => i.type === 'podcast');
    return items;
  }, [featuredItems, filter]);

  const heroMode = useMemo(() => {
    if (visibleFeatured.length === 0) return 'hidden' as const;
    // Full hero for the default view (no tribune filter, latest sort).
    if (sort === 'latest' && communityId === undefined && filter === 'all') return 'full' as const;
    return 'compact' as const;
  }, [visibleFeatured, sort, communityId, filter]);

  const fetchItems = useCallback(
    async (
      f: FilterType,
      s: SortType,
      cId: number | undefined,
      off: number,
      append: boolean,
    ) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const data = await fetchPressGalleryItems(supabase, {
          filter: f,
          sort: s,
          communityId: cId,
          offset: off,
          limit: PAGE_SIZE,
          excludeArticleIds: heroArticleIds,
          locale,
        });

        if (controller.signal.aborted) return;

        if (append) {
          setItems((prev) => [...prev, ...data.items]);
          setOffset(off + data.items.length);
        } else {
          setItems(data.items);
          setOffset(data.items.length);
        }
        setHasMore(data.hasMore);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : t('errorLoading'));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [supabase, heroArticleIds, t, locale],
  );

  const handleFilterChange = (f: FilterType) => {
    setFilter(f);
    setItems([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    fetchItems(f, sort, communityId, 0, false);
  };

  const handleSortChange = (s: SortType) => {
    setSort(s);
    setItems([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    fetchItems(filter, s, communityId, 0, false);
  };

  const handleCommunityChange = (cId: number | undefined) => {
    setCommunityId(cId);
    setItems([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    fetchItems(filter, sort, cId, 0, false);
  };

  const handleLoadMore = () => {
    fetchItems(filter, sort, communityId, offset, true);
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        {/* Visually hidden but kept for SEO / screen readers. The home page
            still needs a single h1; the visible title used to live in the
            old sticky app bar, which has been removed in favour of the
            in-feed toolbar pattern. */}
        <h1 className="sr-only">{t('title')}</h1>

        {/* Error banner */}
        {error && (
          <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Full-width pool banner, above the headline */}
        <Link
          href="/lnh/pool"
          className="group relative mb-6 block overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-r from-brand-blue to-brand-blue-dark p-5 text-white transition hover:opacity-95 dark:border-gray-700 sm:p-6"
        >
          {/* Decorative background — subtle, behind the content */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/bg_pool.png"
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
          />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{tPool('menuLink')}</p>
              <p className="mt-0.5 text-xl font-extrabold uppercase tracking-tight text-white drop-shadow sm:text-2xl">
                {tPool.rich('bannerTitle', { b: (chunks) => <span className="text-red-500">{chunks}</span> })}
              </p>
              <p className="mt-1 max-w-2xl text-sm text-white/90">{tPool('tagline')}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-brand-blue-dark transition group-hover:gap-2.5">
              {tPool('cta')} →
            </span>
          </div>
        </Link>

        {/* Hero section */}
        {heroMode !== 'hidden' && (
          <HeroSection featuredItems={visibleFeatured} mode={heroMode} />
        )}

        {/* Ad banner after hero */}
        <AdBanner slotId="press-hero-banner" className="my-6" />

        {/* Content + sidebar */}
        <div className="flex gap-6">
          {/* Main content — unified grid */}
          <div className="flex-1 min-w-0">
            {/* Combined feed toolbar: section heading on the left, filter
                controls on the right. This used to be a separate sticky
                app bar at the very top of the page — moved in-feed to cut
                the chrome from 3 stacked bars down to 2 (global header +
                category strip), matching the pattern used by The
                Athletic, L'Équipe, RDS and Le Devoir in 2026. */}
            <div className="mb-5 flex flex-col gap-3 border-b border-gray-200 pb-3 dark:border-gray-700 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  {t('feedHeading')}
                </h2>
                <span className="text-xs text-gray-400">{t('feedSubheading')}</span>
              </div>
              <div className="min-w-0 md:flex-shrink-0">
                <PressFilterBar
                  filter={filter}
                  sort={sort}
                  communityId={communityId}
                  communities={communities}
                  onFilterChange={handleFilterChange}
                  onSortChange={handleSortChange}
                  onCommunityChange={handleCommunityChange}
                />
              </div>
            </div>
            {items.length > 0 && (
              <PatternGrid items={items} />
            )}

            {/* No results */}
            {!loading && items.length === 0 && !error && (
              <p className="py-12 text-center text-gray-400">
                {t('noResults')}
              </p>
            )}

            {/* Load more */}
            {hasMore && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="rounded-lg bg-brand-blue px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-blue-dark disabled:opacity-50"
                >
                  {loading ? t('loading') : t('loadMore')}
                </button>
              </div>
            )}

            {/* La Taverne section */}
            {taverneItems.length > 0 && (
              <section className="mt-12 border-t border-gray-200 pt-8 dark:border-gray-700">
                <div className="mb-5 flex items-center gap-3">
                  <span className="text-5xl">🍺</span>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 md:text-2xl">
                      {t('taverne')}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('taverneSubtitle')}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {taverneItems.map((item) => (
                    <PressContentCard key={`taverne-${item.type}-${item.id}`} item={item} />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar — desktop only. Poll first (interactive engagement
              hook), then the Nordiquomètre / Exposmètre vote cards, then
              Top of the week, then ad. Sticky so it follows the reader
              as they scroll the feed. */}
          <aside className="hidden w-[320px] shrink-0 lg:block">
            <div className="sticky top-24 space-y-4">
              <PollBlock poll={poll} />
              <MetreCards />
              {sidebarSlot}
              <AdSlot slotId="press-sidebar" format="half-page" />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ─── Pattern Grid: 2 large + 6 standard + ad, repeat ───

function PatternGrid({ items }: { items: PressGalleryItem[] }) {
  const chunks: { type: 'feature' | 'standard' | 'ad'; items: PressGalleryItem[] }[] = [];
  let idx = 0;

  while (idx < items.length) {
    // Feature duo (2 large cards)
    const featureEnd = Math.min(idx + FEATURE_DUO_SIZE, items.length);
    chunks.push({ type: 'feature', items: items.slice(idx, featureEnd) });
    idx = featureEnd;

    // Standard grid (up to 6 cards)
    if (idx < items.length) {
      const standardEnd = Math.min(idx + (PATTERN_SIZE - FEATURE_DUO_SIZE), items.length);
      chunks.push({ type: 'standard', items: items.slice(idx, standardEnd) });
      idx = standardEnd;
    }

    // Ad slot between cycles
    if (idx < items.length) {
      chunks.push({ type: 'ad', items: [] });
    }
  }

  return (
    <div className="space-y-6">
      {chunks.map((chunk, i) => {
        if (chunk.type === 'ad') {
          return (
            <div key={`ad-${i}`} className="my-6">
              <AdSlot slotId={`feed-ad-press-${i}`} format="in-feed" layoutKey="-6t+ed+2i-1n-4w" />
            </div>
          );
        }

        if (chunk.type === 'feature') {
          return (
            <div key={`feature-${i}`} className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {chunk.items.map((item) => (
                <PressContentCard key={`${item.type}-${item.id}`} item={item} variant="large" />
              ))}
            </div>
          );
        }

        return (
          <div key={`standard-${i}`} className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {chunk.items.map((item) => (
              <PressContentCard key={`${item.type}-${item.id}`} item={item} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
