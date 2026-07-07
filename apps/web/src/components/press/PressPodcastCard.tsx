'use client';

import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { formatDate, displayCommunityName } from '@arena/shared';
import { ArticleCoverPlaceholder } from './ArticleCoverPlaceholder';
import type { PressGalleryItem } from '@/services/pressGalleryService';

interface PressPodcastCardProps {
  item: PressGalleryItem;
}

export function PressPodcastCard({ item }: PressPodcastCardProps) {
  const t = useTranslations('pressGallery');
  const locale = useLocale();
  const href = `/tribunes/${item.communitySlug}/podcasts/${item.id}`;
  const communityName = displayCommunityName(
    { name: item.communityName, name_en: item.communityNameEn },
    locale,
  );

  const durationLabel = item.durationSeconds
    ? `${Math.round(item.durationSeconds / 60)} min`
    : null;

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-lg dark:border-gray-700 dark:bg-[#1e1e1e]"
    >
      {/* Cover image with play overlay */}
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
          <ArticleCoverPlaceholder title={item.title} seed={item.id} />
        )}

        {/* Play icon overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
            <svg
              className="h-6 w-6"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
              <path d="M6 10.5a.75.75 0 01.75.75v.75a5.25 5.25 0 1010.5 0v-.75a.75.75 0 011.5 0v.75a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-.75A.75.75 0 016 10.5z" />
            </svg>
          </div>
        </div>

        {/* Badges row */}
        <div className="absolute left-2 top-2 flex items-center gap-2">
          {/* Podcast badge */}
          <span className="rounded bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white">
            {t('podcast')}
          </span>

          {/* Live badge */}
          {item.isLive && (
            <span className="flex items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              {locale === 'fr' ? 'EN DIRECT' : 'LIVE'}
            </span>
          )}
        </div>

        {/* Duration */}
        {durationLabel && (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
            {durationLabel}
          </span>
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

        {/* Description */}
        {item.description && (
          <p className="mb-3 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
            {item.description}
          </p>
        )}

        {/* Author + date + duration */}
        <div className="mt-auto flex items-center gap-2 text-xs text-gray-400">
          <span className="font-medium text-gray-600 dark:text-gray-300">
            {item.authorName}
          </span>
          <span>&middot;</span>
          <span>{formatDate(item.publishedAt)}</span>
          {durationLabel && (
            <>
              <span>&middot;</span>
              <span>{durationLabel}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
