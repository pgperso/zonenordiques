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

  const explore = [
    { href: '/', label: t('footer.home') },
    { href: '/recherche', label: t('search.title') },
    { href: '/a-propos', label: t('footer.about') },
    { href: '/contact', label: t('footer.contact') },
  ];
  const info = [
    { href: '/conditions-utilisation', label: t('footer.terms') },
    { href: '/politique-confidentialite', label: t('footer.privacy') },
    { href: '/mentions-legales', label: t('footer.legal') },
    { href: '/normes-editoriales', label: t('footer.editorialStandards') },
  ];

  const linkClass =
    'text-sm text-white/70 transition hover:text-white focus-visible:text-white';
  const headingClass =
    'mb-3 text-xs font-semibold uppercase tracking-wider text-white/50';

  return (
    <footer className="bg-[#0b1220] text-white/70">
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-6 sm:py-12">
        <div className="grid grid-cols-2 gap-8 sm:gap-10 lg:grid-cols-4">
          {/* Brand block — full width on mobile, half on lg */}
          <div className="col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5">
              <Image
                src={BRAND.logo}
                alt={t('brand.name')}
                width={40}
                height={40}
                className="h-9 w-9"
              />
              <span className="text-lg font-bold text-white">{t('brand.name')}</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-white/60">{BRAND.tagline}</p>

            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
                {t('footer.followUs')}
              </p>
              <a
                href={BRAND.twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${BRAND.name} sur X`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/80 transition hover:border-white hover:bg-white hover:text-[#0b1220]"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Explore column */}
          <nav aria-label={t('footer.exploreTitle')}>
            <h2 className={headingClass}>{t('footer.exploreTitle')}</h2>
            <ul className="space-y-2.5">
              {explore.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Information column */}
          <nav aria-label={t('footer.infoTitle')}>
            <h2 className={headingClass}>{t('footer.infoTitle')}</h2>
            <ul className="space-y-2.5">
              {info.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      {/* Legal bar */}
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-1.5 px-5 py-4 text-center text-xs text-white/50 sm:flex-row sm:justify-between sm:gap-4 sm:px-6 sm:text-left">
          <p>
            &copy; {year} {t('brand.name')}. {t('footer.rights')}
          </p>
          <p className="italic">{BRAND.tagline}</p>
        </div>
      </div>
    </footer>
  );
}
