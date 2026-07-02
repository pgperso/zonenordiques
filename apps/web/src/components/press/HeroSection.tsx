'use client';

import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { formatTime, displayCommunityName } from '@arena/shared';
import { BRAND } from '@/lib/brand';
import { ShareButton } from '@/components/ui/ShareButton';
import type { PressGalleryItem } from '@/services/pressGalleryService';

function itemHref(item: PressGalleryItem): string {
  if (item.type === 'article' && item.slug) {
    return `/tribunes/${item.communitySlug}/articles/${item.slug}`;
  }
  return `/tribunes/${item.communitySlug}/podcasts/${item.id}`;
}

function shareUrl(item: PressGalleryItem, locale: string): string {
  return `${BRAND.url}/${locale}${itemHref(item)}`;
}

function localizedCommunityName(item: PressGalleryItem, locale: string): string {
  return displayCommunityName(
    { name: item.communityName, name_en: item.communityNameEn },
    locale,
  );
}

// Stretched link + share button shared by every hero card: the whole card
// navigates, but the share control stays a real sibling of the link (never
// a button nested inside an anchor).
function CardLink({ item }: { item: PressGalleryItem }) {
  return (
    <Link href={itemHref(item)} className="absolute inset-0" aria-label={item.title}>
      <span className="sr-only">{item.title}</span>
    </Link>
  );
}

function OverlayShare({ item }: { item: PressGalleryItem }) {
  const locale = useLocale();
  return (
    <div className="absolute right-3 top-3 z-10">
      <ShareButton
        url={shareUrl(item, locale)}
        title={item.title}
        className="flex items-center rounded-lg bg-black/40 p-2 text-white backdrop-blur-sm transition hover:bg-black/60"
      />
    </div>
  );
}

interface HeroSectionProps {
  featuredItems: PressGalleryItem[];
  mode: 'full' | 'compact';
}

export function HeroSection({ featuredItems, mode }: HeroSectionProps) {
  const t = useTranslations('pressGallery');

  if (featuredItems.length === 0) return null;

  if (mode === 'compact') {
    return <CompactStrip items={featuredItems} label={t('featured')} />;
  }

  return (
    <section className="mb-8">
      <h2 className="mb-5 text-xl font-bold text-gray-900 dark:text-gray-100 md:text-2xl">
        {t('featured')}
      </h2>

      {featuredItems.length === 1 && (
        <SingleHero item={featuredItems[0]} />
      )}

      {featuredItems.length === 2 && (
        <DuoHero items={featuredItems.slice(0, 2)} />
      )}

      {featuredItems.length >= 3 && (
        <TrioHero
          hero={featuredItems[0]}
          secondary={featuredItems.slice(1, 3)}
        />
      )}
    </section>
  );
}

// ─── Single hero: full-width cinematic ───

function SingleHero({ item }: { item: PressGalleryItem }) {
  const locale = useLocale();
  return (
    <div className="group relative block overflow-hidden rounded-xl">
      <div className="relative aspect-[16/9] w-full lg:aspect-[21/9]">
        {item.coverImageUrl ? (
          <Image
            src={item.coverImageUrl}
            alt={item.title}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            style={{ objectPosition: `center ${item.coverPositionY}%` }}
            sizes="100vw"
            priority
          />
        ) : (
          <div className="h-full w-full bg-gray-200 dark:bg-gray-700" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/15" />
        <HeroOverlay item={item} titleClass="text-2xl md:text-4xl" communityName={localizedCommunityName(item, locale)} />
      </div>
      <CardLink item={item} />
      <OverlayShare item={item} />
    </div>
  );
}

// ─── Duo hero: two equal overlay cards ───

function DuoHero({ items }: { items: PressGalleryItem[] }) {
  const locale = useLocale();
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {items.map((item) => (
        <div
          key={`${item.type}-${item.id}`}
          className="group relative block overflow-hidden rounded-xl"
        >
          <div className="relative aspect-[16/9] w-full">
            {item.coverImageUrl ? (
              <Image
                src={item.coverImageUrl}
                alt={item.title}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                style={{ objectPosition: `center ${item.coverPositionY}%` }}
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
              />
            ) : (
              <div className="h-full w-full bg-gray-200 dark:bg-gray-700" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/15" />
            <HeroOverlay item={item} titleClass="text-xl md:text-2xl" communityName={localizedCommunityName(item, locale)} />
          </div>
          <CardLink item={item} />
          <OverlayShare item={item} />
        </div>
      ))}
    </div>
  );
}

// ─── Trio hero: ESPN layout — 1 large + 2 stacked ───

function TrioHero({ hero, secondary }: { hero: PressGalleryItem; secondary: PressGalleryItem[] }) {
  const locale = useLocale();
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Hero — spans 2 cols, 2 rows on desktop */}
      <div className="group relative block overflow-hidden rounded-xl lg:col-span-2 lg:row-span-2">
        <div className="relative aspect-[16/9] h-full w-full">
          {hero.coverImageUrl ? (
            <Image
              src={hero.coverImageUrl}
              alt={hero.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              style={{ objectPosition: `center ${hero.coverPositionY}%` }}
              sizes="(max-width: 1024px) 100vw, 66vw"
              priority
            />
          ) : (
            <div className="h-full w-full bg-gray-200 dark:bg-gray-700" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/15" />
          <HeroOverlay item={hero} titleClass="text-2xl md:text-3xl" showExcerpt communityName={localizedCommunityName(hero, locale)} />
        </div>
        <CardLink item={hero} />
        <OverlayShare item={hero} />
      </div>

      {/* Secondary — vertical cards */}
      {secondary.map((item) => {
        const communityName = localizedCommunityName(item, locale);
        return (
        <div
          key={`${item.type}-${item.id}`}
          className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-[#1e1e1e]"
        >
          <div className="relative aspect-[4/3] w-full overflow-hidden">
            {item.coverImageUrl ? (
              <Image
                src={item.coverImageUrl}
                alt={item.title}
                fill
                loading="lazy"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                style={{ objectPosition: `center ${item.coverPositionY}%` }}
                sizes="(max-width: 1024px) 100vw, 22vw"
              />
            ) : (
              <div className="h-full w-full bg-gray-200 dark:bg-gray-700" />
            )}
          </div>
          <div className="flex flex-1 flex-col justify-center p-3">
            <div className="mb-1 flex items-center gap-1.5">
              {item.communityLogoUrl && (
                <Image
                  src={item.communityLogoUrl}
                  alt={communityName}
                  width={16}
                  height={16}
                  className="h-4 w-4 rounded-full object-cover"
                />
              )}
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                {communityName}
              </span>
            </div>
            <h4 className="line-clamp-2 text-sm font-semibold text-gray-900 group-hover:text-brand-blue dark:text-gray-100">
              {item.title}
            </h4>
            <div className="mt-1.5 flex items-center text-[11px] text-gray-400">
              <span>{item.authorName} &middot; {formatTime(item.publishedAt)}</span>
              <ShareButton
                url={shareUrl(item, locale)}
                title={item.title}
                className="relative z-10 ml-auto flex items-center rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-gray-800"
              />
            </div>
          </div>
          <CardLink item={item} />
        </div>
        );
      })}
    </div>
  );
}

// ─── Compact strip (for filtered state) ───

function CompactStrip({ items, label }: { items: PressGalleryItem[]; label: string }) {
  const locale = useLocale();
  return (
    <section className="mb-6">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </h3>
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {items.map((item) => {
          const communityName = localizedCommunityName(item, locale);
          return (
          <div
            key={`${item.type}-${item.id}`}
            className="group relative flex min-w-[280px] max-w-[320px] shrink-0 items-center gap-3 rounded-lg border border-gray-200 bg-white p-2 transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-[#1e1e1e]"
          >
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
              {item.coverImageUrl ? (
                <Image
                  src={item.coverImageUrl}
                  alt={item.title}
                  fill
                  className="object-cover"
                  style={{ objectPosition: `center ${item.coverPositionY}%` }}
                  sizes="64px"
                />
              ) : (
                <div className="h-full w-full bg-gray-200 dark:bg-gray-700" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="mb-0.5 flex items-center gap-1">
                {item.communityLogoUrl && (
                  <Image
                    src={item.communityLogoUrl}
                    alt={communityName}
                    width={12}
                    height={12}
                    className="h-3 w-3 rounded-full object-cover"
                  />
                )}
                <span className="text-[10px] font-medium text-gray-400">
                  {communityName}
                </span>
              </div>
              <h4 className="line-clamp-2 text-xs font-semibold text-gray-900 group-hover:text-brand-blue dark:text-gray-100">
                {item.title}
              </h4>
            </div>
            <ShareButton
              url={shareUrl(item, locale)}
              title={item.title}
              className="relative z-10 flex shrink-0 items-center rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-brand-blue dark:hover:bg-gray-800"
            />
            <CardLink item={item} />
          </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Shared overlay for hero cards ───

function HeroOverlay({ item, titleClass, showExcerpt, communityName }: { item: PressGalleryItem; titleClass: string; showExcerpt?: boolean; communityName: string }) {
  return (
    <div className="absolute inset-x-0 bottom-0 p-4 md:p-6">
      <div className="mb-2 flex items-center gap-2">
        {item.communityLogoUrl && (
          <Image
            src={item.communityLogoUrl}
            alt={communityName}
            width={20}
            height={20}
            className="h-5 w-5 rounded-full object-cover"
          />
        )}
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
          {communityName}
        </span>
      </div>

      <h3 className={`mb-2 font-bold leading-tight text-white ${titleClass}`}>
        {item.title}
      </h3>

      {showExcerpt && item.excerpt && (
        <p className="mb-3 line-clamp-2 text-sm text-gray-200 md:text-base">
          {item.excerpt}
        </p>
      )}

      <div className="flex items-center gap-2 text-xs text-gray-300">
        <span className="font-medium">{item.authorName}</span>
        <span>&middot;</span>
        <span>{formatTime(item.publishedAt)}</span>
      </div>
    </div>
  );
}
