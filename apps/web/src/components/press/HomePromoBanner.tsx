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
  domain: string;
  subtitleFr: string;
  subtitleEn: string;
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
    domain: 'zoneexpos.com',
    subtitleFr: 'L’antichambre du baseball',
    subtitleEn: 'The baseball fan zone',
    logo: '/images/logo.png',
    from: '#0A2A5E',
    to: '#C8102E',
    bg: '/images/expos_banner.webp',
  },
  zoneexpos: {
    name: 'Zone Nordiques',
    url: 'https://zonenordiques.com',
    domain: 'zonenordiques.com',
    subtitleFr: 'L’antichambre du hockey',
    subtitleEn: 'The hockey fan zone',
    logo: '/images/zonenordiques.png',
    from: '#002B57',
    to: '#003E7E',
    bg: '/images/nordiques_banner.jpg',
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

  // Sliding carousel: the whole panels swap by translating a flex track, so it
  // reads as one container sliding out and the next sliding in (not a content
  // crossfade). Each slide is 100% wide; the track shifts by -active * 100%.
  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl">
      <div
        className="flex transition-transform duration-700 ease-[cubic-bezier(0.65,0,0.35,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(-${active * 100}%)` }}
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className="w-full shrink-0"
            aria-hidden={i !== active}
            inert={i !== active}
          >
            {slide}
          </div>
        ))}
      </div>
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
      target="_blank"
      rel="noopener noreferrer"
      className="group relative block overflow-hidden rounded-2xl border border-gray-200 p-5 text-white transition hover:opacity-95 dark:border-gray-700 sm:p-6"
      style={{ backgroundImage: `linear-gradient(90deg, ${sister.from}, ${sister.to})` }}
    >
      {sister.bg && (
        <>
          {/* Photo at reduced opacity over the brand gradient, so it reads as a
              soft translucent background rather than a full-bleed photo. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sister.bg}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-700 group-hover:scale-105"
          />
          {/* Light left scrim, just enough to seat the text. */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(90deg, rgba(3,14,36,0.55) 0%, rgba(3,14,36,0.25) 55%, rgba(3,14,36,0) 100%)' }}
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
            className="hidden h-12 w-12 shrink-0 object-contain sm:block"
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
              {sister.domain}
            </p>
            <p className="mt-0.5 text-xl font-extrabold uppercase tracking-tight text-white drop-shadow sm:text-2xl">
              {isFr ? 'Visite' : 'Visit'} {sister.name}
            </p>
            <p className="mt-1 max-w-2xl text-sm text-white/90">{isFr ? sister.subtitleFr : sister.subtitleEn}</p>
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
