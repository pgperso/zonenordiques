'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SITE } from '@/lib/siteConfig';
import { BRAND } from '@/lib/brand';

/**
 * Rotating promo banner at the top of the home gallery.
 *
 * Zone Nordiques carries the NHL-pool banner AND a cross-promo for Zone Expos,
 * gently crossfading between the two. Zone Expos (no pool) shows a single
 * cross-promo for Zone Nordiques. The "sister" brand is picked from BRAND.id,
 * so each site promotes the other with zero extra config.
 *
 * Rhythm: each slide holds ~9s, then a slow 1s crossfade — calm, not flashy.
 * Respects prefers-reduced-motion (the fade is dropped, the rotation stays).
 */

interface Sister {
  name: string;
  url: string;
  taglineFr: string;
  taglineEn: string;
  emoji: string;
  logo: string;
  from: string;
  to: string;
  // Optional full-bleed background photo (a dark scrim keeps the text legible).
  bg?: string;
}

// Exactly two brands cross-promote each other. Keyed by the CURRENT brand id:
// each entry is the OTHER site.
const SISTERS: Record<string, Sister> = {
  zonenordiques: {
    name: 'Zone Expos',
    url: 'https://zoneexpos.com',
    taglineFr: 'Le retour du baseball à Montréal',
    taglineEn: 'Baseball’s return to Montreal',
    emoji: '⚾',
    logo: '/images/zoneexpos.png',
    from: '#0A2A5E',
    to: '#C8102E',
    bg: '/images/expos_banner.jpg',
  },
  zoneexpos: {
    name: 'Zone Nordiques',
    url: 'https://zonenordiques.com',
    taglineFr: 'Le retour des Nordiques à Québec',
    taglineEn: 'The Nordiques’ return to Quebec City',
    emoji: '🏒',
    logo: '/images/zonenordiques.png',
    from: '#002B57',
    to: '#003E7E',
  },
};

const ROTATE_MS = 9000;

export function HomePromoBanner() {
  const tPool = useTranslations('pool');
  const isFr = useLocale() === 'fr';
  const sister = SISTERS[BRAND.id] ?? null;

  const slides: React.ReactNode[] = [];
  if (SITE.showPool) slides.push(<PoolSlide key="pool" t={tPool} />);
  if (sister) slides.push(<SisterSlide key="sister" sister={sister} isFr={isFr} />);

  const [active, setActive] = useState(0);
  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => setActive((a) => (a + 1) % slides.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [slides.length]);

  if (slides.length === 0) return null;
  if (slides.length === 1) return <div className="mb-6">{slides[0]}</div>;

  return (
    <div className="relative mb-6">
      {slides.map((slide, i) => (
        <div
          key={i}
          aria-hidden={i !== active}
          className={`transition-opacity duration-1000 ease-in-out motion-reduce:transition-none ${
            i === active ? 'opacity-100' : 'pointer-events-none absolute inset-0 opacity-0'
          }`}
        >
          {slide}
        </div>
      ))}
    </div>
  );
}

function PoolSlide({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <Link
      href="/lnh/pool"
      className="group relative block overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-r from-brand-blue to-brand-blue-dark p-5 text-white transition hover:opacity-95 dark:border-gray-700 sm:p-6"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/bg_pool.webp"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20"
      />
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{t('menuLink')}</p>
          <p className="mt-0.5 text-xl font-extrabold uppercase tracking-tight text-white drop-shadow sm:text-2xl">
            {t.rich('bannerTitle', { b: (chunks) => <span className="text-red-500">{chunks}</span> })}
          </p>
          <p className="mt-1 max-w-2xl text-sm text-white/90">{t('tagline')}</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-5 py-2.5 text-sm font-bold text-brand-blue-dark transition group-hover:gap-2.5">
          {t('cta')} →
        </span>
      </div>
    </Link>
  );
}

function SisterSlide({ sister, isFr }: { sister: Sister; isFr: boolean }) {
  return (
    <a
      href={sister.url}
      className="group relative block overflow-hidden rounded-2xl border border-gray-200 p-5 text-white transition hover:opacity-95 dark:border-gray-700 sm:p-6"
      style={sister.bg ? undefined : { backgroundImage: `linear-gradient(90deg, ${sister.from}, ${sister.to})` }}
    >
      {sister.bg && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sister.bg}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          {/* Dark scrim, heavier on the left where the text sits. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(90deg, rgba(3,14,36,0.92) 0%, rgba(3,14,36,0.66) 52%, rgba(3,14,36,0.30) 100%)' }}
          />
        </>
      )}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sister.logo}
            alt=""
            aria-hidden
            width={48}
            height={48}
            className="hidden h-12 w-12 shrink-0 rounded-full sm:block"
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
              {sister.emoji} {isFr ? 'Notre autre site' : 'Our other site'}
            </p>
            <p className="mt-0.5 text-xl font-extrabold uppercase tracking-tight text-white drop-shadow sm:text-2xl">
              {isFr ? 'Découvre' : 'Discover'} {sister.name}
            </p>
            <p className="mt-1 max-w-2xl text-sm text-white/90">{isFr ? sister.taglineFr : sister.taglineEn}</p>
          </div>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-5 py-2.5 text-sm font-bold transition group-hover:gap-2.5"
          style={{ color: sister.to }}
        >
          {isFr ? 'Visiter' : 'Visit'} →
        </span>
      </div>
    </a>
  );
}
