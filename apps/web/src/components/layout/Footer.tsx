'use client';

import { Link, usePathname } from '@/i18n/navigation';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { BRAND } from '@/lib/brand';

// Feed/chat pages are full-height, app-like views where the tall marketing
// footer wastes vertical space. On those routes we render a slim one-line bar
// instead.
function isChatRoute(pathname: string): boolean {
  return (
    pathname.startsWith('/tribunes/') ||
    pathname === '/exposmetre' ||
    pathname === '/nordiquometre'
  );
}

export function Footer() {
  const t = useTranslations();
  const pathname = usePathname();
  const year = new Date().getFullYear();

  if (isChatRoute(pathname)) {
    const legal = [
      { href: '/conditions-utilisation', label: t('footer.terms') },
      { href: '/politique-confidentialite', label: t('footer.privacy') },
      { href: '/mentions-legales', label: t('footer.legal') },
    ];
    return (
      <footer className="border-t border-gray-200 bg-white px-4 py-2 dark:border-gray-800 dark:bg-[#1e1e1e]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
          <span>
            &copy; {year} {t('brand.name')}
          </span>
          {legal.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition hover:text-gray-600 dark:hover:text-gray-300"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </footer>
    );
  }

  // Essentials only, per footer best practices: About/Contact + the legal
  // pages a news site (and AdSense) needs. No multi-column marketing block.
  const links = [
    { href: '/a-propos', label: t('footer.about') },
    { href: '/contact', label: t('footer.contact') },
    { href: '/conditions-utilisation', label: t('footer.terms') },
    { href: '/politique-confidentialite', label: t('footer.privacy') },
    { href: '/mentions-legales', label: t('footer.legal') },
    { href: '/normes-editoriales', label: t('footer.editorialStandards') },
  ];

  return (
    <footer className="border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-[#1e1e1e]">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-2.5 px-4 py-3 sm:flex-row sm:justify-between sm:gap-4">
        {/* Brand */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image src={BRAND.logo} alt={t('brand.name')} width={22} height={22} className="h-[22px] w-[22px]" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{t('brand.name')}</span>
        </Link>

        {/* Essential links */}
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition hover:text-brand-blue dark:hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Copyright + social */}
        <div className="flex shrink-0 items-center gap-3 text-xs text-gray-400">
          <span className="whitespace-nowrap">&copy; {year}</span>
          <a
            href={BRAND.twitterUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${BRAND.name} sur X`}
            className="transition hover:text-brand-blue dark:hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
