'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { FeedContainer } from '@/components/feed/FeedContainer';
import { PressContentCard } from '@/components/press/PressContentCard';
import { AdSidebar } from '@/components/ads/AdSidebar';
import { AdAnchor } from '@/components/ads/AdAnchor';
import { AdSlot } from '@/components/ads/AdSlot';
import { useSupabase } from '@/hooks/useSupabase';
import { joinCommunity } from '@/services/communityService';
import { useTribune } from '@/contexts/TribuneContext';
import type { PressGalleryItem } from '@/services/pressGalleryService';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { BRAND } from '@/lib/brand';
import type { Database } from '@arena/supabase-client';

type CommunityRow = Database['public']['Tables']['communities']['Row'];

interface CommunityPageClientProps {
  community: CommunityRow;
  // Locale-aware display values resolved on the server so server & client
  // render the same strings without re-running the helper everywhere.
  displayName: string;
  displayDescription: string | null;
  isMember: boolean;
  canModerate: boolean;
  canCreateContent: boolean;
  isMuted: boolean;
  articleNotifMuted: boolean;
  userId: string | null;
  staffRoles: Record<string, string>;
  hubArticles: PressGalleryItem[];
  hubPodcasts: PressGalleryItem[];
}

export function CommunityPageClient({
  community,
  displayName,
  displayDescription,
  isMember: initialIsMember,
  canModerate,
  canCreateContent,
  staffRoles,
  isMuted,
  articleNotifMuted,
  userId,
  hubArticles,
  hubPodcasts,
}: CommunityPageClientProps) {
  const router = useRouter();
  const supabase = useSupabase();
  const t = useTranslations();
  const { setTribune } = useTribune();
  const [isMember] = useState(initialIsMember);
  const [joining, setJoining] = useState(false);
  const [memberCount] = useState(community.member_count);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Tell the Header we're in a tribune + track last visit for sorting
  useEffect(() => {
    setTribune({ id: community.id, name: displayName, slug: community.slug });
    try {
      const visits = JSON.parse(localStorage.getItem('tribune_visits') || '{}');
      visits[community.id] = Date.now();
      localStorage.setItem('tribune_visits', JSON.stringify(visits));
    } catch { /* ignore */ }
    return () => setTribune(null);
  }, [displayName, community.slug, community.id, setTribune]);

  async function handleJoin() {
    if (!userId) {
      router.push('/login');
      return;
    }
    setJoining(true);
    setJoinError(null);
    const { error } = await joinCommunity(supabase, community.id, userId);
    if (error) {
      setJoinError(error.message);
      toast.error(t('toast.genericError'));
      setJoining(false);
      return;
    }
    toast.success(t('toast.joined', { name: displayName }));
    // router.refresh() re-fetches the server component. The server now
    // returns isMember=true, which changes the key from "id-false" to
    // "id-true". React destroys this instance and creates a fresh one
    // with initialIsMember=true — all state initializes correctly.
    router.refresh();
  }


  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {isMember ? (
        <>
          {/* Pool LNH entry point — only on the LNH tribune. */}
          {community.slug === 'lnh' && (
            <Link
              href="/lnh/pool"
              className="flex items-center justify-center gap-2 border-t border-gray-200 bg-brand-blue-dark px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-brand-blue dark:border-gray-700"
            >
              {t('pool.tagline')} <span className="underline">{t('pool.cta')}</span>
            </Link>
          )}
          {/* 3-column layout: [Ad left] | [Feed] | [Ad right] */}
          <div className="flex flex-1 overflow-hidden border-t border-gray-200 dark:border-gray-700">
            {/* Left ad sidebar - xl+ only */}
            <AdSidebar position="left" />

            {/* Central feed area */}
            <div className="flex-1 overflow-hidden bg-white dark:bg-[#1e1e1e]">
              <FeedContainer
                communityId={community.id}
                communityName={community.name}
                communitySlug={community.slug}
                isMember={isMember}
                isMuted={isMuted}
                articleNotifMuted={articleNotifMuted}
                canModerate={canModerate}
                canCreateContent={canCreateContent}
                staffRoles={staffRoles}
              />
            </div>

            {/* Right ad sidebar - xl+ only (below online members in FeedContainer) */}
            <AdSidebar position="right" />
          </div>

          {/* Mobile sticky ad banner */}
          <AdAnchor />
        </>
      ) : (
        <div className="flex-1 overflow-y-auto border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e]">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10">
            {/* Community header */}
            <header className="mb-8 flex flex-col items-center gap-4 text-center md:flex-row md:items-start md:text-left">
              <Image
                src={community.logo_url || BRAND.logo}
                alt={displayName}
                width={96}
                height={96}
                className="h-20 w-20 shrink-0 object-contain md:h-24 md:w-24"
                priority
              />
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 md:text-4xl">
                  {displayName}
                </h1>
                {displayDescription && (
                  <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400 md:text-base">
                    {displayDescription}
                  </p>
                )}
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-500">
                  {t('common.members', { count: memberCount })}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start">
                  {userId ? (
                    <button
                      onClick={handleJoin}
                      disabled={joining}
                      className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
                    >
                      {joining ? t('community.joining') : t('community.joinThisTribune')}
                    </button>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-blue-dark"
                      >
                        {t('auth.loginAction')}
                      </Link>
                      <Link
                        href="/register"
                        className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-transparent dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        {t('auth.register')}
                      </Link>
                    </>
                  )}
                </div>
                {joinError && (
                  <p className="mt-2 text-xs text-red-500">{joinError}</p>
                )}
              </div>
            </header>

            {/* Articles récents */}
            {hubArticles.length > 0 && (
              <section className="mb-10">
                <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100 md:text-2xl">
                  {t('community.recentArticles')}
                </h2>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {hubArticles.slice(0, 6).map((item) => (
                    <PressContentCard key={`article-${item.id}`} item={item} />
                  ))}
                </div>
              </section>
            )}

            {/* Ad banner between articles and podcasts */}
            <div className="my-8 flex justify-center">
              <AdSlot slotId="home-mid-banner" format="leaderboard" />
            </div>

            {/* Podcasts récents */}
            {hubPodcasts.length > 0 && (
              <section className="mb-10">
                <h2 className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100 md:text-2xl">
                  {t('community.recentPodcasts')}
                </h2>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {hubPodcasts.slice(0, 6).map((item) => (
                    <PressContentCard key={`podcast-${item.id}`} item={item} />
                  ))}
                </div>
              </section>
            )}

            {hubArticles.length === 0 && hubPodcasts.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {t('community.noContentYet')}
              </p>
            )}

            {/* Join CTA card */}
            <section className="mt-10 rounded-xl border border-brand-blue/20 bg-gradient-to-br from-brand-blue/5 to-transparent p-6 md:p-8">
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="mb-3 text-xl font-bold text-gray-900 dark:text-gray-100 md:text-2xl">
                  {t('community.joinDiscussionTitle')}
                </h2>
                <p className="mb-5 text-sm text-gray-700 dark:text-gray-300 md:text-base">
                  {t('community.joinDiscussionBody')}
                </p>
                {userId ? (
                  <button
                    onClick={handleJoin}
                    disabled={joining}
                    className="rounded-lg bg-brand-blue px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
                  >
                    {joining ? t('community.joining') : t('community.joinThisTribune')}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="inline-block rounded-lg bg-brand-blue px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-blue-dark"
                  >
                    {t('auth.loginAction')}
                  </Link>
                )}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
