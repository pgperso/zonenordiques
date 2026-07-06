'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, MessageCircle } from 'lucide-react';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useSupabase } from '@/hooks/useSupabase';

/**
 * Two stacked sidebar cards: the live Nordiquomètre confidence index (the
 * average of every vote, all horizons pooled) and a "Lazoom" shortcut badge
 * straight into the Zone Nordiques chat. Rendered in the gallery sidebar
 * between the poll and "Top of the week".
 */
export function MetreCards() {
  const locale = useLocale();
  const supabase = useSupabase();
  const isFr = locale === 'fr';

  // Nordiquomètre confidence index — null when there are no votes yet.
  const [nordAverage, setNordAverage] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data } = await supabase.from('nordiquometre_votes').select('vote');
      if (cancelled) return;
      const rows = data as { vote: number }[] | null;
      setNordAverage(
        rows && rows.length
          ? Math.round(rows.reduce((sum, r) => sum + r.vote, 0) / rows.length)
          : null,
      );
      setLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <div className="space-y-3">
      {/* Nordiquomètre — live confidence index */}
      <Link
        href="/nordiquometre"
        className="group flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-sm transition hover:shadow-md"
        style={{ backgroundColor: '#003E7E' }}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/15">
          {loaded ? (
            <span className="text-base font-extrabold leading-none tabular-nums">
              {nordAverage === null ? '—' : `${nordAverage}%`}
            </span>
          ) : (
            <span className="h-4 w-8 animate-pulse rounded bg-white/30" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-base font-bold leading-tight">
            {isFr ? 'Nordiquomètre' : 'Nordiquometer'}
          </span>
          <span className="block text-xs text-white/70">
            {isFr
              ? 'L’indice de confiance du retour des Nordiques'
              : 'The confidence index for the Nordiques’ return'}
          </span>
        </span>
        <ChevronRight
          className="ml-auto shrink-0 text-white/50 transition group-hover:text-white"
          size={18}
          aria-hidden="true"
        />
      </Link>

      {/* Lazoom — shortcut into the live chat */}
      <Link
        href="/tribunes/zone-nordiques"
        className="group flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-sm transition hover:shadow-md"
        style={{ backgroundColor: '#1969B4' }}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/15">
          <MessageCircle size={22} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-base font-bold leading-tight">Lazoom</span>
          <span className="block text-xs text-white/70">
            {isFr ? 'Rejoins la discussion en direct' : 'Join the live discussion'}
          </span>
        </span>
        <ChevronRight
          className="ml-auto shrink-0 text-white/50 transition group-hover:text-white"
          size={18}
          aria-hidden="true"
        />
      </Link>
    </div>
  );
}
