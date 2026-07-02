'use client';

import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useSupabase } from '@/hooks/useSupabase';

type MetreKey = 'nordiquometre' | 'exposmetre';

/**
 * Two stacked sidebar cards linking to the Nordiquomètre and Exposmètre
 * voting pages. Each card is a solid team-blue tile; in place of an icon
 * it shows the meter's live confidence index (the average of every vote,
 * all horizons pooled). Rendered in the gallery sidebar between the poll
 * and "Top of the week".
 */
export function MetreCards() {
  const locale = useLocale();
  const supabase = useSupabase();
  const isFr = locale === 'fr';

  // Confidence index per meter — null when there are no votes yet.
  const [averages, setAverages] = useState<Record<MetreKey, number | null>>({
    nordiquometre: null,
    exposmetre: null,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    function average(rows: { vote: number }[] | null): number | null {
      if (!rows || rows.length === 0) return null;
      return Math.round(rows.reduce((sum, r) => sum + r.vote, 0) / rows.length);
    }

    async function load() {
      const [nord, expo] = await Promise.all([
        supabase.from('nordiquometre_votes').select('vote'),
        supabase.from('exposmetre_votes').select('vote'),
      ]);
      if (cancelled) return;
      setAverages({
        nordiquometre: average(nord.data as { vote: number }[] | null),
        exposmetre: average(expo.data as { vote: number }[] | null),
      });
      setLoaded(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const cards = [
    {
      key: 'nordiquometre' as MetreKey,
      href: '/nordiquometre',
      title: isFr ? 'Nordiquomètre' : 'Nordiquometer',
      tagline: isFr
        ? 'L’indice de confiance du retour des Nordiques'
        : 'The confidence index for the Nordiques’ return',
      accent: '#0B4870', // Nordiques blue
    },
    {
      key: 'exposmetre' as MetreKey,
      href: '/exposmetre',
      title: isFr ? 'Exposmètre' : 'Exposmeter',
      tagline: isFr
        ? 'L’indice de confiance du retour des Expos'
        : 'The confidence index for the Expos’ return',
      accent: '#003087', // Expos blue
    },
  ];

  return (
    <div className="space-y-3">
      {cards.map((c) => {
        const avg = averages[c.key];
        return (
          <Link
            key={c.href}
            href={c.href}
            className="group flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-sm transition hover:shadow-md"
            style={{ backgroundColor: c.accent }}
          >
            {/* Live confidence index — replaces the old icon */}
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/15">
              {loaded ? (
                <span className="text-base font-extrabold leading-none tabular-nums">
                  {avg === null ? '—' : `${avg}%`}
                </span>
              ) : (
                <span className="h-4 w-8 animate-pulse rounded bg-white/30" aria-hidden="true" />
              )}
            </span>

            {/* Title + tagline */}
            <span className="min-w-0">
              <span className="block text-base font-bold leading-tight">
                {c.title}
              </span>
              <span className="block text-xs text-white/70">
                {c.tagline}
              </span>
            </span>

            <ChevronRight
              className="ml-auto shrink-0 text-white/50 transition group-hover:text-white"
              size={18}
              aria-hidden="true"
            />
          </Link>
        );
      })}
    </div>
  );
}
