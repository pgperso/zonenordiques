'use client';

import { useState, useMemo } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import Image from 'next/image';
import { toast } from 'sonner';
import { useSupabase } from '@/hooks/useSupabase';
import { leaveCommunity } from '@/services/communityService';
import { JoinTribuneModal } from '@/components/community/JoinTribuneModal';
import { displayCommunityName, displayCommunityDescription } from '@arena/shared';
import { BRAND } from '@/lib/brand';
import type { Database } from '@arena/supabase-client';

type CommunityRow = Database['public']['Tables']['communities']['Row'] & {
  name_en?: string | null;
  description_en?: string | null;
};

interface TribunesClientProps {
  communities: CommunityRow[];
  userId: string;
  memberCommunityIds: number[];
}

export function TribunesClient({ communities, userId, memberCommunityIds }: TribunesClientProps) {
  const t = useTranslations('home');
  const tc = useTranslations('community');
  const tco = useTranslations('common');
  const tp = useTranslations('pressGallery');
  const tToast = useTranslations('toast');
  const locale = useLocale();
  const router = useRouter();
  const supabase = useSupabase();
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [leaveConfirm, setLeaveConfirm] = useState<CommunityRow | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Sort communities by last visited (most recent first), then by locale-aware name
  const sortedCommunities = useMemo(() => {
    let visits: Record<string, number> = {};
    try {
      visits = JSON.parse(localStorage.getItem('tribune_visits') || '{}');
    } catch { /* ignore */ }
    return [...communities].sort((a, b) => {
      const va = visits[a.id] || 0;
      const vb = visits[b.id] || 0;
      if (va !== vb) return vb - va; // most recent first
      return displayCommunityName(a, locale).localeCompare(displayCommunityName(b, locale));
    });
  }, [communities, locale]);

  async function handleLeave(community: CommunityRow) {
    setLeaving(true);
    const { error } = await leaveCommunity(supabase, community.id, userId);
    if (error) {
      toast.error(tToast('genericError'));
    } else {
      toast.success(tToast('left', { name: displayCommunityName(community, locale) }));
      router.refresh();
    }
    setLeaving(false);
    setLeaveConfirm(null);
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4">
        {/* Header — sticky on mobile */}
        <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between bg-gray-50 dark:bg-[#1e1e1e]/95 px-4 py-3 backdrop-blur-sm sm:static sm:mx-0 sm:mb-8 sm:mt-8 sm:bg-transparent sm:px-0 sm:py-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 sm:text-2xl">{t('myTribunes')}</h1>
          <button
            onClick={() => setShowJoinModal(true)}
            className="flex items-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-blue-dark"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('joinNewTribune')}
          </button>
        </div>

        {/* La Taverne + Galerie de presse — side by side */}
        {(() => {
          const taverne = sortedCommunities.find((c) => c.slug === 'la-taverne');
          const others = sortedCommunities.filter((c) => c.slug !== 'la-taverne');
          return (
            <>
              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {taverne && (() => {
                  const taverneName = displayCommunityName(taverne, locale);
                  const taverneDesc = displayCommunityDescription(taverne, locale);
                  return (
                  <Link
                    href={`/tribunes/${taverne.slug}`}
                    className="flex items-center gap-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] p-5 transition hover:border-brand-blue/30 hover:shadow-md sm:p-6"
                  >
                    <Image
                      src={taverne.logo_url || BRAND.logo}
                      alt={taverneName}
                      width={56}
                      height={56}
                      className="h-14 w-14 shrink-0 rounded-lg object-contain"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 sm:text-lg">
                        {taverneName}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                        {taverneDesc}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        {taverne.member_count} membre{taverne.member_count !== 1 ? 's' : ''} — Ouverte à tous
                      </p>
                    </div>
                    <svg className="h-6 w-6 shrink-0 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </Link>
                  );
                })()}

                {/* Galerie de presse */}
                <Link
                  href="/"
                  className="flex items-center gap-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] p-5 transition hover:border-brand-blue/30 hover:shadow-md sm:p-6"
                >
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-red-50 dark:bg-red-950">
                    <svg className="h-7 w-7 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6V7.5Z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-gray-900 dark:text-gray-100 sm:text-lg">
                      {tp('title')}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                      {tp('subtitle')}
                    </p>
                  </div>
                  <svg className="h-6 w-6 shrink-0 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              </div>

              {others.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {others.map((community) => {
                    const communityName = displayCommunityName(community, locale);
                    const communityDesc = displayCommunityDescription(community, locale);
                    return (
                    <div
                      key={community.id}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] p-4 sm:p-5"
                    >
                      <div className="mb-3 flex items-center gap-3">
                        <Image
                          src={community.logo_url || BRAND.logo}
                          alt={communityName}
                          width={48}
                          height={48}
                          className="h-12 w-12 shrink-0 rounded-lg object-contain"
                        />
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100 sm:text-base">
                            {communityName}
                          </h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
                            {community.member_count} membre{community.member_count !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      {communityDesc && (
                        <p className="mb-3 line-clamp-2 text-xs text-gray-400">{communityDesc}</p>
                      )}
                      <div className="flex gap-2">
                        <Link
                          href={`/tribunes/${community.slug}`}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-blue px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-blue-dark"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                          </svg>
                          {tc('join')}
                        </Link>
                        <button
                          onClick={() => setLeaveConfirm(community)}
                          title={tc('leave')}
                          className="flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-gray-400 transition hover:border-red-500 hover:bg-red-500 hover:text-white"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : !taverne ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 py-16">
            <Image
              src={BRAND.logo}
              alt={BRAND.name}
              width={48}
              height={48}
              className="mb-4 opacity-40"
            />
            <p className="mb-1 text-sm font-medium text-gray-500 dark:text-gray-400">{t('noTribunesYet')}</p>
            <p className="mb-6 text-xs text-gray-400">{t('discoverTribunes')}</p>
            <button
              onClick={() => setShowJoinModal(true)}
              className="rounded-xl bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-blue-dark"
            >
              {t('joinNewTribune')}
            </button>
                </div>
              ) : null}
            </>
          );
        })()}
      </div>

      {showJoinModal && (
        <JoinTribuneModal
          userId={userId}
          memberCommunityIds={memberCommunityIds}
          onClose={() => setShowJoinModal(false)}
        />
      )}

      {/* Leave confirmation modal */}
      {leaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white dark:bg-[#1e1e1e] p-6 shadow-xl">
            <h3 className="mb-2 text-base font-bold text-gray-900 dark:text-gray-100">
              {tc('leaveTitle', { name: displayCommunityName(leaveConfirm, locale) })}
            </h3>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
              {tc('leaveMessage')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setLeaveConfirm(null)}
                disabled={leaving}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-[#1e1e1e] disabled:opacity-50"
              >
                {tco('cancel')}
              </button>
              <button
                onClick={() => handleLeave(leaveConfirm)}
                disabled={leaving}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {leaving ? tco('loading') : tc('leave')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
