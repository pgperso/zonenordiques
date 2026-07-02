'use client';

import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';

export interface CategoryNavItem {
  id: number;
  slug: string;
  name: string;
  name_en: string | null;
}

interface CategoryNavProps {
  categories: CategoryNavItem[];
  // Optional: highlight one of the pills (e.g. on /sport/[category]).
  activeSlug?: string;
}

/**
 * Horizontal scrollable strip of sport categories, rendered above the
 * gallery filter bar on the home page and on category landing pages.
 * Each pill links to /sport/[slug] — a crawlable landing page that
 * Google can index as a topic hub.
 *
 * The pills don't filter the in-page feed; they navigate. This is the
 * deliberate IA split: filters are for users staying on home, category
 * pages are for users who want to commit to a topic (and for crawlers
 * who need a hub URL).
 */
export function CategoryNav({ categories, activeSlug }: CategoryNavProps) {
  const locale = useLocale();
  if (categories.length === 0) return null;

  return (
    <nav
      aria-label={locale === 'fr' ? 'Catégories sportives' : 'Sport categories'}
      className="border-b border-gray-200 dark:border-gray-700"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-1.5 overflow-x-auto px-3 py-2 scrollbar-none sm:px-4">
        <Link
          href="/"
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold transition-colors ${
            !activeSlug
              ? 'bg-brand-red text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
          }`}
        >
          {locale === 'fr' ? 'Tous' : 'All'}
        </Link>
        {categories.map((c) => {
          const label = locale === 'en' && c.name_en ? c.name_en : c.name;
          const active = activeSlug === c.slug;
          return (
            <Link
              key={c.slug}
              href={`/sport/${c.slug}`}
              className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand-red text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
