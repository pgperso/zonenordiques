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
 * Gallery toolbar: a content-type segmented control (all / articles /
 * podcasts) on the left and the sort toggle on the right — a single clean
 * row. The tribune dropdown only appears with more than one community (never
 * on the single-tribune Zone Nordiques site). La Taverne is excluded — it has
 * its own dedicated block at the bottom of the gallery.
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

  const filteredCommunities = communities.filter((c) => c.slug !== 'la-taverne');

  const segItem = (active: boolean, position: 'l' | 'm' | 'r') =>
    `px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? 'bg-brand-blue text-white'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
    } ${position === 'l' ? 'rounded-l-lg' : position === 'r' ? 'rounded-r-lg' : ''}`;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      {/* Content-type segmented control */}
      <div className="flex shrink-0 rounded-lg border border-gray-300 dark:border-gray-600">
        {types.map(({ key, label }, i) => (
          <button
            key={`type-${key}`}
            onClick={() => onFilterChange(key)}
            className={segItem(filter === key, i === 0 ? 'l' : i === types.length - 1 ? 'r' : 'm')}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {filteredCommunities.length > 1 && (
          <select
            value={communityId ?? ''}
            onChange={(e) =>
              onCommunityChange(e.target.value ? Number(e.target.value) : undefined)
            }
            className="min-w-0 max-w-[180px] truncate rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-[#1e1e1e] dark:text-gray-300"
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
          <button onClick={() => onSortChange('latest')} className={segItem(sort === 'latest', 'l')}>
            {t('latest')}
          </button>
          <button onClick={() => onSortChange('trending')} className={segItem(sort === 'trending', 'r')}>
            {t('trending')}
          </button>
        </div>
      </div>
    </div>
  );
}
