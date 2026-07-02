import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export const metadata: Metadata = {
  title: 'Page introuvable',
  robots: { index: false, follow: false },
};

export default async function NotFound() {
  const t = await getTranslations('notFound');

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md text-center">
        <p className="mb-2 text-5xl font-bold text-gray-300">404</p>
        <h2 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('title')}
        </h2>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          {t('body')}
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-brand-blue px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          {t('home')}
        </Link>
      </div>
    </div>
  );
}
