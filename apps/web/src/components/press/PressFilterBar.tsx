'use client';

import { useTranslations, useLocale } from 'next-intl';
import { displayCommunityName } from '@arena/shared';

type FilterType = 'all' | 'articles' | 'podcasts';
type SortType = 'latest' | 'trending';

interface Community {
  id: number;
  name: string;
  name_en?: string | null;
  slug: string;
  logo_url: string | null;
}

interface PressFilterBarProps {
  filter: FilterType;
  sort: SortType;
  communityId: number | undefined;
  communities: Community[];
  onFilterChange: (filter: FilterType) => void;
  onSortChange: (sort: SortType) => void;
  onCommunityChange: (communityId: number | undefined) => void;
}

/**
 * Gallery filter bar: content type (all / articles / podcasts), a
 * tribune dropdown, and the sort toggle. Sport categories are NOT here
 * — the CategoryNav strip above the gallery owns sport navigation
 * (each sport links to its own /sport/[slug] hub). Keeping a separate
 * vague "Sport / Taverne" pill set here only duplicated and muddied
 * that, so it was removed.
 */
export function PressFilterBar({
  filter,
  sort,
  communityId,
  communities,
  onFilterChange,
  onSortChange,
  onCommunityChange,
}: PressFilterBarProps) {
  const t = useTranslations('pressGallery');
  const locale = useLocale();

  const types: { key: FilterType; label: string }[] = [
    { key: 'all', label: t('all') },
    { key: 'articles', label: t('articles') },
    { key: 'podcasts', label: t('podcasts') },
  ];

  // La Taverne has its own dedicated section in the gallery, so it's
  // kept out of the tribune dropdown.
  const filteredCommunities = communities.filter((c) => c.slug !== 'la-taverne');

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {/* Type pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {types.map(({ key, label }) => (
            <button
              key={`type-${key}`}
              onClick={() => onFilterChange(key)}
              className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                filter === key
                  ? 'bg-brand-blue text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Community dropdown + Sort */}
        <div className="flex min-w-0 items-center gap-2">
          {filteredCommunities.length > 0 && (
            <select
              value={communityId ?? ''}
              onChange={(e) =>
                onCommunityChange(
                  e.target.value ? Number(e.target.value) : undefined,
                )
              }
              className="min-w-0 max-w-[180px] truncate rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-[#1e1e1e] dark:text-gray-300 sm:max-w-none"
            >
              <option value="">{t('allCommunities')}</option>
              {filteredCommunities.map((c) => (
                <option key={c.id} value={c.id}>
                  {displayCommunityName(c, locale)}
                </option>
              ))}
            </select>
          )}

          <div className="flex shrink-0 rounded-lg border border-gray-300 dark:border-gray-600">
            <button
              onClick={() => onSortChange('latest')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                sort === 'latest'
                  ? 'bg-brand-blue text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              } rounded-l-lg`}
            >
              {t('latest')}
            </button>
            <button
              onClick={() => onSortChange('trending')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                sort === 'trending'
                  ? 'bg-brand-blue text-white'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
              } rounded-r-lg`}
            >
              {t('trending')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
