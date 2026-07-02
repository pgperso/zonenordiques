import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Inscription',
  description: `Créez votre compte sur ${BRAND.name} et rejoignez la communauté sportive.`,
  robots: { index: false, follow: false },
};

export default async function RegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('auth');

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('createAccount')}</h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t('registerSubtitle')}
            </p>
          </div>
          <RegisterForm />
        </div>
      </div>
    </div>
  );
}
