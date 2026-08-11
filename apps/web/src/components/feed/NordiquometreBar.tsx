'use client';

import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useSupabase } from '@/hooks/useSupabase';
import { Link } from '@/i18n/navigation';

/**
 * Slim, always-on strip at the top of the chat showing the live Nordiquomètre
 * confidence index (average of every member's general vote). Tapping it opens
 * the full Nordiquomètre to vote. Height is fixed whether or not the value has
 * loaded, so it never shifts the feed underneath it.
 */
export function NordiquometreBar() {
  const supabase = useSupabase();
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('nordiquometre_votes')
      .select('vote')
      .then(({ data }) => {
        if (cancelled || !data) return;
        const votes = data as { vote: number }[];
        setPct(votes.length > 0 ? Math.round(votes.reduce((a, v) => a + v.vote, 0) / votes.length) : 0);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const width = pct ?? 0;

  return (
    <Link
      href="/nordiquometre"
      title="Nordiquomètre — vote pour l'indice de confiance"
      className="group flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-1.5 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-[#1e1e1e] dark:hover:bg-[#272525]"
    >
      <span className="shrink-0 text-[11px] font-semibold text-brand-blue">Nordiquomètre</span>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-brand-blue to-brand-blue-dark transition-[width] duration-700 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] font-bold tabular-nums text-brand-blue">
        {pct === null ? '' : `${pct}%`}
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-brand-blue" strokeWidth={2} aria-hidden="true" />
    </Link>
  );
}
