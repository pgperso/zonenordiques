'use client';

import { ChevronRight } from 'lucide-react';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';

/**
 * Two stacked sidebar cards — the Nordiquomètre voting page and a shortcut into
 * the Zone Nordiques chat ("La Zone"). Each is a solid brand-blue tile with a
 * faded background image (the meter's dial / the podcast cover). Rendered in
 * the gallery sidebar between the poll and "Top of the week".
 */
export function MetreCards() {
  const locale = useLocale();
  const isFr = locale === 'fr';

  const cards = [
    {
      href: '/nordiquometre',
      bg: '#002B57',
      image: '/images/nordiquometre.png',
      title: isFr ? 'Le Nordiquomètre' : 'The Nordiquometer',
      tagline: isFr
        ? 'L’indice de confiance du retour des Nordiques'
        : 'The confidence index for the Nordiques’ return',
    },
    {
      href: '/tribunes/zone-nordiques',
      bg: '#0B4870',
      image: '/images/la-zone-podcast.webp',
      title: 'La Zone',
      tagline: isFr ? 'Rejoins la discussion en direct' : 'Join the live discussion',
    },
  ];

  return (
    <div className="space-y-3">
      {cards.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="group relative flex items-center overflow-hidden rounded-xl px-4 py-4 text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
          style={{ backgroundColor: c.bg }}
        >
          {/* Faded background image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={c.image}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-15 transition-opacity duration-200 group-hover:opacity-30"
          />
          <span className="relative z-10 min-w-0">
            <span className="block text-base font-bold uppercase tracking-wide leading-tight drop-shadow">{c.title}</span>
            <span className="block text-xs text-white/80 drop-shadow">{c.tagline}</span>
          </span>
          <ChevronRight
            className="relative z-10 ml-auto shrink-0 text-white/70 transition group-hover:translate-x-0.5 group-hover:text-white"
            size={18}
            aria-hidden="true"
          />
        </Link>
      ))}
    </div>
  );
}
