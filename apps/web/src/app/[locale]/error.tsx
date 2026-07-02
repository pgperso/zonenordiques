'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errorPage');

  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('title')}
        </h2>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          {t('body')}
        </p>
        <button
          onClick={() => reset()}
          className="rounded-lg bg-brand-blue px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          {t('retry')}
        </button>
      </div>
    </div>
  );
}
