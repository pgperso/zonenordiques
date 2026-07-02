'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

const STORAGE_KEY = 'pool-beta-dismissed';

/** Temporary beta notice on the pool home — dismissible, remembered per device. */
export function BetaNotice() {
  const t = useTranslations('pool.beta');
  // Hidden until mounted so SSR and the dismissed state don't mismatch.
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(localStorage.getItem(STORAGE_KEY) !== '1');
  }, []);

  if (!show) return null;

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-[#252525]">
      <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
        {t('badge')}
      </span>
      <p className="flex-1 text-gray-600 dark:text-gray-300">{t('message')}</p>
      <button
        type="button"
        onClick={() => { localStorage.setItem(STORAGE_KEY, '1'); setShow(false); }}
        aria-label={t('dismiss')}
        className="shrink-0 rounded px-1 text-gray-500 transition-colors hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
      >
        ✕
      </button>
    </div>
  );
}
