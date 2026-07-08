'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { Search } from 'lucide-react';

export function SearchBox({ initialQuery, placeholder }: { initialQuery: string; placeholder: string }) {
  const [q, setQ] = useState(initialQuery);
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim();
    if (query.length >= 2) router.push(`/recherche?q=${encodeURIComponent(query)}`);
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          autoFocus
          className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue dark:border-gray-600 dark:bg-[#1e1e1e] dark:text-gray-100"
        />
      </div>
      <button
        type="submit"
        className="shrink-0 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-blue-dark"
      >
        <Search className="h-4 w-4 sm:hidden" aria-hidden="true" />
        <span className="hidden sm:inline">OK</span>
      </button>
    </form>
  );
}
