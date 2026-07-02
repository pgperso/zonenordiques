'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

const LINKS = [
  { href: '/lnh/pool', key: 'navHome' },
  { href: '/lnh/pool/classement', key: 'standings' },
  { href: '/lnh/pool/moi', key: 'myTeam' },
] as const;

/** Consistent pool navigation shown at the top of every pool page. */
// Which top-level tab a (possibly deep) pool path belongs to.
function isActive(href: string, path: string): boolean {
  if (href === '/lnh/pool') return path === '/lnh/pool';
  if (href === '/lnh/pool/moi') return path.startsWith('/lnh/pool/moi') || path.startsWith('/lnh/pool/composer');
  if (href === '/lnh/pool/classement')
    return path.startsWith('/lnh/pool/classement') || path.startsWith('/lnh/pool/equipe') || path.startsWith('/lnh/pool/joueur');
  return path.startsWith(href);
}

export function PoolNav() {
  const path = usePathname();
  const t = useTranslations('pool');
  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Link href="/lnh/pool" className="flex items-center gap-1.5 text-xl font-extrabold uppercase tracking-tight text-gray-900 sm:text-2xl dark:text-gray-100">
        {t('navTitle')}
      </Link>
      <div className="flex gap-1">
        {LINKS.map((l) => {
          const active = isActive(l.href, path);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-900'
                  : 'rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#252525]'
              }
            >
              {t(l.key)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
