'use client';

import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTranslations, useLocale } from 'next-intl';
import { useTribune } from '@/contexts/TribuneContext';
import { useDarkMode } from '@/hooks/useDarkMode';
import { MobileNav } from './MobileNav';
import { NotificationBell } from './NotificationBell';
import { fetchUserCommunities, type UserCommunitySummary } from '@/services/communityService';
import { BRAND } from '@/lib/brand';
import { Sun, Moon, Monitor } from 'lucide-react';
import type { CategoryNavItem } from '@/components/press/CategoryNav';

interface HeaderProps {
  // Sport categories shown inside the navigation dropdown (desktop) and
  // the mobile drawer. Sourced from the layout so the same list is
  // available across every route without each page refetching.
  categories: CategoryNavItem[];
}

export function Header({ categories }: HeaderProps) {
  const router = useRouter();
  const { user, username, avatarUrl, loading } = useAuth();
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const { tribune, setMembersOpen } = useTribune();
  const { theme, cycle: cycleTheme, setTheme } = useDarkMode();
  const ta = useTranslations('a11y');
  const themeLabel =
    theme === 'light' ? ta('themeLight') : theme === 'dark' ? ta('themeDark') : ta('themeSystem');
  const themeTitle = `${ta('theme')} : ${themeLabel}`;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [userTribunes, setUserTribunes] = useState<UserCommunitySummary[]>([]);

  const otherLocale = locale === 'fr' ? 'en' : 'fr';
  const switchLocalePath = `/${otherLocale}${pathname}`;
  const dropdownRef = useRef<HTMLDivElement>(null);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setDropdownOpen(false);
    router.push('/');
    router.refresh();
  }

  // Close dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  useEffect(() => {
    if (!user) {
      setUserTribunes([]);
      return;
    }
    const supabase = createClient();
    fetchUserCommunities(supabase, user.id).then(setUserTribunes);
  }, [user]);

  return (
    <header className="relative z-[60] shrink-0 border-b border-gray-200 bg-white dark:border-gray-700 dark:border-gray-800 dark:bg-[#1e1e1e]">
      <div className="flex h-12 items-center justify-between px-3 sm:h-14 sm:px-4 md:h-16">
        {/* Logo — on mobile in tribune: back arrow + tribune name */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {tribune && (
            <Link
              href="/tribunes"
              aria-label={t('a11y.back')}
              className="flex items-center rounded-lg p-1.5 text-gray-600 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] md:hidden"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </Link>
          )}
          <Link href="/" className="flex items-center gap-1.5 sm:gap-2">
            <Image
              src={BRAND.logo}
              alt={BRAND.name}
              width={36}
              height={36}
              priority
              className="h-7 w-7 object-contain sm:h-8 sm:w-8 md:h-9 md:w-9"
            />
            {tribune ? (
              <>
                <span className="text-base font-bold text-gray-900 dark:text-gray-100 md:hidden">{tribune.name}</span>
                <div className="hidden md:block">
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100 md:text-xl">{t('brand.name')}</span>
                  <p className="text-[10px] leading-tight text-gray-400 dark:text-gray-500">{t('brand.tagline')}</p>
                </div>
              </>
            ) : (
              <div>
                <span className="text-base font-bold text-gray-900 dark:text-gray-100 sm:text-lg md:text-xl">{t('brand.name')}</span>
                <p className="hidden text-[10px] leading-tight text-gray-400 dark:text-gray-500 sm:block">{t('brand.tagline')}</p>
              </div>
            )}
          </Link>
        </div>

        {/* Language + Desktop auth */}
        <div className="hidden items-center gap-3 md:flex">
          <SportsMenu categories={categories} />
          {user ? (
            <TribunesMenu userTribunes={userTribunes} align="left" />
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-brand-red px-3 py-1.5 text-sm font-bold text-white transition hover:bg-brand-red-dark"
            >
              {t('home.myTribunes')}
            </Link>
          )}
          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
          <button
            onClick={cycleTheme}
            aria-label={themeTitle}
            title={themeTitle}
            className="rounded-md p-2 text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-700 dark:hover:text-gray-300 dark:text-gray-300 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            {theme === 'light' ? (
              <Sun className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            ) : theme === 'dark' ? (
              <Moon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            ) : (
              <Monitor className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
            )}
          </button>
          <a
            href={switchLocalePath}
            aria-label={t('a11y.switchLanguage')}
            className="rounded-md px-2 py-1 text-xs font-bold text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-700 dark:hover:text-gray-300 dark:text-gray-300 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            {otherLocale.toUpperCase()}
          </a>
          <div className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
          {loading ? (
            <div className="h-8 w-24 animate-pulse rounded-lg bg-gray-200" />
          ) : user ? (
            <>
              <NotificationBell userId={user.id} />
              <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-label={t('a11y.userMenu')}
                aria-expanded={dropdownOpen}
                aria-haspopup="menu"
                className="flex items-center gap-2 rounded-lg px-2 py-1 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e]"
              >
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={username ?? ''}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue text-xs font-bold text-white">
                    {(username ?? 'U')[0].toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{username}</span>
                <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] shadow-lg">
                  <Link
                    href="/vestiaire"
                    onClick={() => setDropdownOpen(false)}
                    className="flex w-full items-center gap-2 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-[#1e1e1e]"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                    </svg>
                    {t('vestiaire.title')}
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-3 text-sm text-red-600 transition hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
                    </svg>
                    {t('auth.logout')}
                  </button>
                </div>
              )}
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:text-brand-blue"
              >
                {t('auth.login')}
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-blue-dark"
              >
                {t('auth.register')}
              </Link>
            </>
          )}
        </div>

        {/* Mobile: notifications + Tribunes pill (or members button when
            already in a tribune) + burger. The Tribunes pill matches the
            desktop CTA — buried in the burger menu, the navigation was
            functionally invisible to readers on phones. */}
        <div className="flex items-center gap-2 md:hidden">
          {user && <NotificationBell userId={user.id} />}
          {user && tribune ? (
            <button
              onClick={() => setMembersOpen(true)}
              aria-label={t('tribune.membersOnline')}
              className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-1.997M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </button>
          ) : (
            <Link
              href={user ? '/tribunes' : '/login'}
              className="rounded-lg bg-brand-red px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-brand-red-dark"
            >
              {t('home.myTribunes')}
            </Link>
          )}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? t('a11y.closeMenu') : t('a11y.openMenu')}
          aria-expanded={mobileMenuOpen}
        >
          <svg
            className="h-6 w-6 text-gray-600 dark:text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            {mobileMenuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
              />
            )}
          </svg>
        </button>
        </div>
      </div>

      {/* Mobile nav */}
      <MobileNav
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        user={user}
        username={username}
        avatarUrl={avatarUrl}
        onLogout={handleLogout}
        userTribunes={userTribunes}
        categories={categories}
        theme={theme}
        onSetTheme={setTheme}
        otherLocale={otherLocale}
        switchLocalePath={switchLocalePath}
      />
    </header>
  );
}

interface SportsMenuProps {
  categories: CategoryNavItem[];
}

/** Sport-categories dropdown, separate from the tribunes menu so each
 *  button has a single concern and neither drawer grows long. Visible
 *  on desktop only; mobile uses the burger drawer. */
function SportsMenu({ categories }: SportsMenuProps) {
  const ta = useTranslations('a11y');
  const th = useTranslations('home');
  const locale = useLocale();
  const pathname = usePathname();
  const isOnGallery = pathname === '/';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  if (categories.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        {ta('sportCategories')}
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-[#1e1e1e]">
          {/* Home shortcut at the top so readers browsing a sport hub
              can return to the gallery without hunting for the logo.
              Hidden when already on the gallery — same rule as the
              Tribunes menu — so the menu never offers a self-link. */}
          {!isOnGallery && (
            <ul className="py-1">
              <li>
                <Link
                  href="/"
                  onClick={() => setOpen(false)}
                  className="block border-b border-gray-100 px-4 py-2 text-sm font-semibold text-gray-900 transition hover:bg-gray-50 dark:border-gray-800 dark:text-gray-100 dark:hover:bg-gray-800"
                >
                  {th('home')}
                </Link>
              </li>
            </ul>
          )}
          <ul className="max-h-72 overflow-y-auto py-1">
            {categories.map((c) => {
              const label = locale === 'en' && c.name_en ? c.name_en : c.name;
              return (
                <li key={c.slug}>
                  <Link
                    href={`/sport/${c.slug}`}
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

interface TribunesMenuProps {
  userTribunes: UserCommunitySummary[];
  align: 'left' | 'right';
}

function TribunesMenu({ userTribunes, align }: TribunesMenuProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const isOnGallery = pathname === '/';
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1 rounded-lg bg-brand-red px-3 py-1.5 text-sm font-bold text-white transition hover:bg-brand-red-dark"
      >
        {t('home.myTribunes')}
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div
          className={`absolute top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-[#1e1e1e] ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <div className="flex flex-col gap-2 p-3">
            <Link
              href="/tribunes"
              onClick={() => setOpen(false)}
              className="block rounded-lg bg-brand-red px-3 py-2 text-center text-sm font-bold text-white transition hover:bg-brand-red-dark"
            >
              {t('home.allMyTribunes')}
            </Link>
            {/* The Galerie de presse shortcut would be a self-link when the
                reader is already on the gallery — hide it there. */}
            {!isOnGallery && (
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="block rounded-lg bg-brand-blue px-3 py-2 text-center text-sm font-bold text-white transition hover:bg-brand-blue-dark"
              >
                {t('pressGallery.title')}
              </Link>
            )}
            <Link
              href="/lnh/pool"
              onClick={() => setOpen(false)}
              className="block rounded-lg bg-brand-blue-dark px-3 py-2 text-center text-sm font-bold text-white transition hover:bg-brand-blue"
            >
              {t('pool.menuLink')}
            </Link>
          </div>
          {userTribunes.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-800">
              <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {t('home.myTribunes')}
              </p>
              <ul className="max-h-64 overflow-y-auto pb-1">
                {userTribunes.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/tribunes/${c.slug}`}
                      onClick={() => setOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
