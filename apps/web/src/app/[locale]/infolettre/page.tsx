import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { BRAND } from '@/lib/brand';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'newsletter' });
  return { title: `${t('pageTitle')} | ${BRAND.name}`, robots: { index: false, follow: true } };
}

export default async function NewsletterResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('newsletter');

  const sp = await searchParams;
  const status = typeof sp.status === 'string' ? sp.status : '';
  const key = status === 'confirmed' ? 'confirmed' : status === 'unsubscribed' ? 'unsubscribed' : 'error';

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      <h1 className="mb-3 text-2xl font-bold text-gray-900 dark:text-gray-100">
        {t(`result.${key}.title`)}
      </h1>
      <p className="mb-8 text-gray-600 dark:text-gray-400">{t(`result.${key}.body`)}</p>
      <Link
        href="/"
        className="rounded-lg bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
      >
        {t('result.backHome')}
      </Link>
    </div>
  );
}
