import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LoginForm } from '@/components/auth/LoginForm';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Connexion',
  description: `Connectez-vous à ${BRAND.name} pour rejoindre vos tribunes sportives.`,
  robots: { index: false, follow: false },
};

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('login')}</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t('loginSubtitle')}
            </p>
          </div>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
