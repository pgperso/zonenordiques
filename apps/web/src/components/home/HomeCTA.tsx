'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/hooks/useAuth';

export function HomeCTA() {
  const t = useTranslations('home');
  const router = useRouter();
  const { user, loading } = useAuth();

  function handleClick() {
    if (user) {
      router.push('/tribunes');
    } else {
      router.push('/login');
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-xl bg-brand-blue px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-brand-blue-dark disabled:opacity-50 sm:px-8 sm:py-3.5 sm:text-base"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
      </svg>
      {t('accessTribunes')}
    </button>
  );
}
