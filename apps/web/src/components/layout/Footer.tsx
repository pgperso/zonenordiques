'use client';

import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { BRAND } from '@/lib/brand';

export function Footer() {
  const t = useTranslations();

  return (
    <footer className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] dark:border-gray-800 dark:bg-[#1e1e1e]">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-1.5 sm:gap-4 sm:px-4 sm:py-2">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Image
            src={BRAND.logo}
            alt={t('brand.name')}
            width={20}
            height={20}
            className="h-5 w-5 sm:h-7 sm:w-7"
          />
          <span className="hidden text-sm font-semibold text-gray-700 dark:text-gray-300 sm:inline">{t('brand.name')}</span>
        </div>

        <nav className="flex flex-wrap gap-2 sm:gap-4">
          <Link
            href="/a-propos"
            className="text-[10px] text-gray-500 dark:text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-300 sm:text-xs"
          >
            {t('footer.about')}
          </Link>
          <Link
            href="/contact"
            className="text-[10px] text-gray-500 dark:text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-300 sm:text-xs"
          >
            {t('footer.contact')}
          </Link>
          <Link
            href="/conditions-utilisation"
            className="text-[10px] text-gray-500 dark:text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-300 sm:text-xs"
          >
            {t('footer.terms')}
          </Link>
          <Link
            href="/politique-confidentialite"
            className="text-[10px] text-gray-500 dark:text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-300 sm:text-xs"
          >
            {t('footer.privacy')}
          </Link>
          <Link
            href="/mentions-legales"
            className="text-[10px] text-gray-500 dark:text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-300 sm:text-xs"
          >
            {t('footer.legal')}
          </Link>
          <Link
            href="/normes-editoriales"
            className="text-[10px] text-gray-500 dark:text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-300 sm:text-xs"
          >
            {t('footer.editorialStandards')}
          </Link>
        </nav>

        <p className="text-[10px] text-gray-400 sm:text-xs">
          &copy; {new Date().getFullYear()} {t('footer.rights')}
        </p>
      </div>
    </footer>
  );
}
