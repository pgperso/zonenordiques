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
import { Sun, Moon, Monitor, Search } from 'lucide-react';

export function Header() {
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
  const [canCreate, setCanCreate] = useState(false);

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
      setCanCreate(false);
      return;
    }
    const supabase = createClient();
    fetchUserCommunities(supabase, user.id).then(setUserTribunes);
    // Content-creation entry points (article/podcast) are shown only to staff
    // (admin/moderator/owner) and creators (Journaliste).
    void supabase
      .from('community_member_roles')
      .select('roles!inner(code)')
      .eq('member_id', user.id)
      .then(({ data }: { data: { roles: { code: string } | null }[] | null }) => {
        const codes = ((data ?? []) as { roles: { code: string } | null }[]).map((r) => r.roles?.code);
        setCanCreate(codes.some((c) => c === 'admin' || c === 'moderator' || c === 'owner' || c === 'creator'));
      });
  }, [user]);

  return (
    <header className="relative z-[60] shrink-0 border-b border-gray-200 bg-white dark:border-gray-700 dark:border-gray-800 dark:bg-[#1e1e1e]">
      <div className="flex h-12 items-center justify-between px-3 sm:h-14 sm:px-4 md:h-16">
        {/* Logo — on mobile in tribune: back arrow + tribune name */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {tribune && (
            <Link
              href="/"
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
                <span className="text-base font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 md:hidden">{tribune.name}</span>
                <div className="hidden md:block">
                  <span className="text-lg font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 md:text-xl">{t('brand.name')}</span>
                  <p className="text-[10px] leading-tight tracking-[0.2em] text-gray-900 dark:text-gray-100"><span className="font-bold">{t('brand.taglineLead')}</span>{t('brand.taglineRest')}</p>
                </div>
              </>
            ) : (
              <div>
                <span className="text-base font-bold uppercase tracking-wide text-gray-900 dark:text-gray-100 sm:text-lg md:text-xl">{t('brand.name')}</span>
                <p className="hidden text-[10px] leading-tight tracking-[0.2em] text-gray-900 dark:text-gray-100 sm:block"><span className="font-bold">{t('brand.taglineLead')}</span>{t('brand.taglineRest')}</p>
              </div>
            )}
          </Link>
        </div>

        {/* Language + Desktop auth */}
        <div className="hidden items-center gap-3 md:flex">
          {tribune ? (
            <Link
              href="/"
              className="rounded-lg bg-brand-red px-3 py-1.5 text-sm font-bold text-white transition hover:bg-brand-red-dark"
            >
              {t('pressGallery.title')}
            </Link>
          ) : (
            <Link
              href="/tribunes/zone-nordiques"
              className="rounded-lg bg-brand-red px-3 py-1.5 text-sm font-bold text-white transition hover:bg-brand-red-dark"
            >
              {t('home.theZone')}
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
          <Link
            href="/recherche"
            aria-label={t('search.title')}
            className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </Link>
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
                  {canCreate && (
                    <>
                      <Link
                        href="/tribunes/zone-nordiques/creer-article"
                        onClick={() => setDropdownOpen(false)}
                        className="flex w-full items-center gap-2 border-t border-gray-100 px-4 py-3 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                        {locale === 'fr' ? 'Créer un article' : 'New article'}
                      </Link>
                      <Link
                        href="/tribunes/zone-nordiques/creer-podcast"
                        onClick={() => setDropdownOpen(false)}
                        className="flex w-full items-center gap-2 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 transition hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
                          <path d="M6 10.5a.75.75 0 01.75.75v.75a5.25 5.25 0 1010.5 0v-.75a.75.75 0 011.5 0v.75a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-.75A.75.75 0 016 10.5z" />
                        </svg>
                        {locale === 'fr' ? 'Créer un podcast' : 'New podcast'}
                      </Link>
                    </>
                  )}
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
          <Link
            href="/recherche"
            aria-label={t('search.title')}
            className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </Link>
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
              href={tribune ? '/' : '/tribunes/zone-nordiques'}
              className="rounded-lg bg-brand-red px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-brand-red-dark"
            >
              {tribune ? t('pressGallery.title') : t('home.theZoneShort')}
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
        theme={theme}
        onSetTheme={setTheme}
        otherLocale={otherLocale}
        switchLocalePath={switchLocalePath}
      />
    </header>
  );
}
