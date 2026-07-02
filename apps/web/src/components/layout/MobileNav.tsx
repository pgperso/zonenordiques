'use client';

import { useEffect } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import type { User } from '@supabase/supabase-js';
import { useTranslations, useLocale } from 'next-intl';
import { Avatar } from '@/components/ui/Avatar';
import type { UserCommunitySummary } from '@/services/communityService';
import type { ThemePref } from '@/hooks/useDarkMode';
import type { CategoryNavItem } from '@/components/press/CategoryNav';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  username: string | null;
  avatarUrl?: string | null;
  onLogout: () => void;
  userTribunes: UserCommunitySummary[];
  categories: CategoryNavItem[];
  theme: ThemePref;
  onSetTheme: (t: ThemePref) => void;
  otherLocale: string;
  switchLocalePath: string;
}

/**
 * Side drawer for the Header burger menu on mobile/tablet. Slides from the
 * right with a dark backdrop — matches the tribune sidebar drawer pattern.
 */
export function MobileNav({
  isOpen,
  onClose,
  user,
  username,
  avatarUrl,
  onLogout,
  userTribunes,
  categories,
  theme,
  onSetTheme,
  otherLocale,
  switchLocalePath,
}: MobileNavProps) {
  const t = useTranslations();
  const tc = useTranslations('common');
  const ta = useTranslations('a11y');
  const locale = useLocale();

  // Close on ESC for keyboard users
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Sport-categories section — shared by both logged-in and logged-out
  // variants. Renders nothing when the categories list is empty so we
  // don't leave a section header dangling.
  const sportsSection = categories.length > 0 && (
    <>
      <p className="mt-4 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        {ta('sportCategories')}
      </p>
      <ul>
        {categories.map((c) => {
          const label = locale === 'en' && c.name_en ? c.name_en : c.name;
          return (
            <li key={c.slug}>
              <Link
                href={`/sport/${c.slug}`}
                onClick={onClose}
                className="block rounded-lg px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );

  // Three-way appearance switcher — defined once, rendered in both the
  // logged-in and logged-out variants of the drawer.
  const themeSwitcher = (
    <div className="rounded-lg px-3 py-2.5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {ta('theme')}
      </p>
      <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
        {(['light', 'dark', 'system'] as const).map((opt) => {
          const Icon = opt === 'light' ? Sun : opt === 'dark' ? Moon : Monitor;
          const label =
            opt === 'light' ? ta('themeLight') : opt === 'dark' ? ta('themeDark') : ta('themeSystem');
          const active = theme === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onSetTheme(opt)}
              aria-pressed={active}
              className={`flex flex-col items-center gap-1 rounded-md py-2 text-[11px] font-medium transition ${
                active
                  ? 'bg-white text-brand-blue shadow-sm dark:bg-[#272525] dark:text-white'
                  : 'text-gray-600 hover:bg-white/60 dark:text-gray-400 dark:hover:bg-[#272525]/60'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] transform border-l border-gray-200 bg-white shadow-xl transition-transform duration-200 dark:border-gray-700 dark:bg-[#1e1e1e] md:hidden ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label={ta('openMenu')}
      >
        {/* Header with close button */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          {user && username ? (
            <div className="flex min-w-0 items-center gap-2">
              <Avatar url={avatarUrl ?? null} name={username} size="sm" />
              <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                {username}
              </span>
            </div>
          ) : (
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {t('brand.name')}
            </span>
          )}
          <button
            onClick={onClose}
            aria-label={tc('close')}
            className="rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col overflow-y-auto px-3 py-3" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
          {user ? (
            <>
              <div className="flex flex-col gap-2">
                <Link
                  href="/tribunes"
                  onClick={onClose}
                  className="block rounded-lg bg-brand-red px-3 py-2 text-center text-sm font-bold text-white transition hover:bg-brand-red-dark"
                >
                  {t('home.allMyTribunes')}
                </Link>
                <Link
                  href="/"
                  onClick={onClose}
                  className="block rounded-lg bg-brand-blue px-3 py-2 text-center text-sm font-bold text-white transition hover:bg-brand-blue-dark"
                >
                  {t('pressGallery.title')}
                </Link>
              </div>

              {sportsSection}

              {userTribunes.length > 0 && (
                <>
                  <p className="mt-4 px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {t('home.myTribunes')}
                  </p>
                  <ul>
                    {userTribunes.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/tribunes/${c.slug}`}
                          onClick={onClose}
                          className="block rounded-lg px-3 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          {c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="my-3 border-t border-gray-200 dark:border-gray-700" />

              <Link
                href="/vestiaire"
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                onClick={onClose}
              >
                {t('vestiaire.title')}
              </Link>

              <div className="my-3 border-t border-gray-200 dark:border-gray-700" />

              {themeSwitcher}
              <a
                href={switchLocalePath}
                onClick={onClose}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <span>{ta('switchLanguage')}</span>
                <span className="text-xs font-bold text-gray-400">{otherLocale.toUpperCase()}</span>
              </a>

              <div className="my-3 border-t border-gray-200 dark:border-gray-700" />

              <button
                onClick={() => { onLogout(); onClose(); }}
                className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950"
              >
                {t('auth.logout')}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                onClick={onClose}
              >
                {t('auth.login')}
              </Link>
              <Link
                href="/register"
                className="mt-1 rounded-lg bg-brand-blue px-3 py-2.5 text-center text-sm font-medium text-white transition hover:bg-brand-blue-dark"
                onClick={onClose}
              >
                {t('auth.register')}
              </Link>

              {sportsSection}

              <div className="my-3 border-t border-gray-200 dark:border-gray-700" />

              {themeSwitcher}
              <a
                href={switchLocalePath}
                onClick={onClose}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <span>{ta('switchLanguage')}</span>
                <span className="text-xs font-bold text-gray-400">{otherLocale.toUpperCase()}</span>
              </a>
            </>
          )}
        </nav>
      </aside>
    </>
  );
}
