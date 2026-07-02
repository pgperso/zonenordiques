'use client';

import Image from 'next/image';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { formatTime, displayCommunityName } from '@arena/shared';
import { BRAND } from '@/lib/brand';
import { ShareButton } from '@/components/ui/ShareButton';
import type { PressGalleryItem } from '@/services/pressGalleryService';

interface PressContentCardProps {
  item: PressGalleryItem;
  variant?: 'large' | 'standard';
}

function itemHref(item: PressGalleryItem): string {
  if (item.type === 'article' && item.slug) {
    return `/tribunes/${item.communitySlug}/articles/${item.slug}`;
  }
  return `/tribunes/${item.communitySlug}/podcasts/${item.id}`;
}

// Articles published within this window get a "Nouveau" / "New" badge to
// signal freshness — the kind of social proof RDS and The Athletic put
// front-and-center to nudge clicks.
const NEW_BADGE_WINDOW_MS = 24 * 60 * 60 * 1000;

function formatViews(count: number, locale: string): string {
  if (count < 1000) return count.toString();
  if (count < 1000000) return `${(count / 1000).toFixed(count < 10000 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(count / 1000000).toFixed(1).replace(/\.0$/, '')}M`.replace('.', locale === 'fr' ? ',' : '.');
}

export function PressContentCard({ item, variant = 'standard' }: PressContentCardProps) {
  const locale = useLocale();
  const isLarge = variant === 'large';
  const isPodcast = item.type === 'podcast';
  const communityName = displayCommunityName(
    { name: item.communityName, name_en: item.communityNameEn },
    locale,
  );
  const publishedAtMs = new Date(item.publishedAt).getTime();
  const isFresh = !Number.isNaN(publishedAtMs) && Date.now() - publishedAtMs < NEW_BADGE_WINDOW_MS;
  const authorInitial = item.authorName.trim().slice(0, 1).toUpperCase();
  const shareUrl = `${BRAND.url}/${locale}${itemHref(item)}`;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-lg dark:border-gray-700 dark:bg-[#1e1e1e]">
      {/* Cover image */}
      <div className={`relative w-full overflow-hidden ${isLarge ? 'aspect-[16/10]' : 'aspect-video'}`}>
        {item.coverImageUrl ? (
          <Image
            src={item.coverImageUrl}
            alt={item.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            style={{ objectPosition: `center ${item.coverPositionY}%` }}
            sizes={isLarge
              ? '(max-width: 768px) 100vw, 50vw'
              : '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw'}
          />
        ) : (
          <div className="h-full w-full bg-gray-200 dark:bg-gray-700" />
        )}

        {/* Fresh-article badge — only for articles published within 24h,
            and only when not a podcast (podcasts have their own overlay
            slot already). Positioned top-right to mirror the LIVE badge
            on podcasts, so the eye knows that corner = "act now". */}
        {!isPodcast && isFresh && (
          <span className="absolute right-2 top-2 rounded bg-brand-red px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            {locale === 'fr' ? 'Nouveau' : 'New'}
          </span>
        )}

        {/* Podcast overlay */}
        {isPodcast && (
          <>
            {/* Play icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-transform group-hover:scale-110">
                <svg className="ml-1 h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>

            {/* Podcast badge */}
            <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
              Podcast
            </span>

            {/* LIVE badge */}
            {item.isLive && (
              <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                EN DIRECT
              </span>
            )}

            {/* Duration badge */}
            {!item.isLive && item.durationSeconds && item.durationSeconds > 0 && (
              <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                {Math.round(item.durationSeconds / 60)} min
              </span>
            )}
          </>
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
        <h3 className={`mb-1 line-clamp-2 font-semibold text-gray-900 group-hover:text-brand-blue dark:text-gray-100 ${isLarge ? 'text-lg md:text-xl' : ''}`}>
          {item.title}
        </h3>

        {/* Excerpt (large variant only) */}
        {isLarge && (item.excerpt || item.description) && (
          <p className="mb-3 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
            {item.excerpt || item.description}
          </p>
        )}

        {/* Author + date + views — denser byline so each card carries the
            social-proof signals that best-in-class sports sites surface
            (author identity, freshness, popularity). View count only
            shown when ≥ 10 to avoid the "37 views" awkwardness on brand-
            new pieces. */}
        <div className="mt-auto flex items-center gap-2 text-xs text-gray-400">
          {item.authorAvatarUrl ? (
            <Image
              src={item.authorAvatarUrl}
              alt={item.authorName}
              width={20}
              height={20}
              className="h-5 w-5 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
              {authorInitial}
            </span>
          )}
          <span className="truncate font-medium text-gray-600 dark:text-gray-300">
            {item.authorName}
          </span>
          <span className="shrink-0">&middot;</span>
          <span className="shrink-0">{formatTime(item.publishedAt)}</span>
          {item.viewCount >= 10 && (
            <>
              <span className="shrink-0">&middot;</span>
              <span className="flex shrink-0 items-center gap-0.5">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                </svg>
                {formatViews(item.viewCount, locale)}
              </span>
            </>
          )}
          {/* Share — above the stretched link so it stays clickable. */}
          <ShareButton
            url={shareUrl}
            title={item.title}
            className="relative z-10 ml-auto flex items-center rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-gray-800"
          />
        </div>
      </div>

      {/* Stretched link: the whole card navigates, share button excepted. */}
      <Link href={itemHref(item)} className="absolute inset-0" aria-label={item.title}>
        <span className="sr-only">{item.title}</span>
      </Link>
    </div>
  );
}
