'use client';

import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { formatTime, displayCommunityName } from '@arena/shared';
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
          <div className="h-full w-full bg-gray-200 dark:bg-gray-700" />
        )}

        {/* Play icon overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-transform group-hover:scale-110">
            <svg
              className="ml-0.5 h-5 w-5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11v11.78a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
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
          <span>{formatTime(item.publishedAt)}</span>
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
