'use client';

import Image from 'next/image';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatTime, displayCommunityName } from '@arena/shared';
import type { PressGalleryItem } from '@/services/pressGalleryService';

interface PressArticleCardProps {
  item: PressGalleryItem;
}

export function PressArticleCard({ item }: PressArticleCardProps) {
  const locale = useLocale();
  const href = `/tribunes/${item.communitySlug}/articles/${item.slug}`;
  const communityName = displayCommunityName(
    { name: item.communityName, name_en: item.communityNameEn },
    locale,
  );

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-lg dark:border-gray-700 dark:bg-[#1e1e1e]"
    >
      {/* Cover image */}
      <div className="relative aspect-video w-full overflow-hidden">
        {item.coverImageUrl ? (
          <Image
            src={item.coverImageUrl}
            alt={item.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            style={{ objectPosition: `center ${item.coverPositionY}%` }}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="h-full w-full bg-gray-200 dark:bg-gray-700" />
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col p-4">
        {/* Community badge */}
        <div className="mb-2 flex items-center gap-1.5">
          {item.communityLogoUrl && (
            <Image
              src={item.communityLogoUrl}
              alt={communityName}
              width={16}
              height={16}
              className="h-4 w-4 rounded-full object-cover"
            />
          )}
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            {communityName}
          </span>
        </div>

        {/* Title */}
        <h3 className="mb-1 line-clamp-2 font-semibold text-gray-900 group-hover:text-brand-blue dark:text-gray-100">
          {item.title}
        </h3>

        {/* Excerpt */}
        {item.excerpt && (
          <p className="mb-3 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
            {item.excerpt}
          </p>
        )}

        {/* Author + date */}
        <div className="mt-auto flex items-center gap-2 text-xs text-gray-400">
          <span className="font-medium text-gray-600 dark:text-gray-300">
            {item.authorName}
          </span>
          <span>&middot;</span>
          <span>{formatTime(item.publishedAt)}</span>
        </div>
      </div>
    </Link>
  );
}
