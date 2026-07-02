'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { CommunityCard } from './CommunityCard';
import { JoinTribuneModal } from './JoinTribuneModal';

interface Community {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  member_count: number;
  logo_url: string | null;
}

interface CommunityGridProps {
  communities: Community[];
}

export function CommunityGrid({ communities }: CommunityGridProps) {
  const { user } = useAuth();
  const t = useTranslations('home');
  const [joinedIds, setJoinedIds] = useState<Set<number>>(new Set());
  const [showJoinModal, setShowJoinModal] = useState(false);

  useEffect(() => {
    if (!user) {
      setJoinedIds(new Set());
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    supabase
      .from('community_members')
      .select('community_id')
      .eq('member_id', user.id)
      .limit(500)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setJoinedIds(new Set(data.map((m) => m.community_id)));
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const joined = communities.filter((c) => joinedIds.has(c.id));
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateArrows();
    window.addEventListener('resize', updateArrows);
    return () => window.removeEventListener('resize', updateArrows);
  }, [updateArrows, joined.length]);

  function handleJoinClick() {
    if (!user) {
      router.push('/login');
      return;
    }
    setShowJoinModal(true);
  }

  return (
    <div>
      {/* Mes tribunes — horizontal scroll */}
      {joined.length > 0 && (
        <ScrollSection title={t('myTribunes')} scrollRef={scrollRef} onScroll={updateArrows} canScrollLeft={canScrollLeft} canScrollRight={canScrollRight}>
          {joined.map((community) => (
            <div key={community.id} className="w-64 shrink-0">
              <CommunityCard
                name={community.name}
                slug={community.slug}
                description={community.description}
                memberCount={community.member_count}
                logoUrl={community.logo_url}
              />
            </div>
          ))}
        </ScrollSection>
      )}

      {/* Rejoindre une tribune — redirects to login if not connected */}
      <div className="flex justify-center">
        <button
          onClick={handleJoinClick}
          className="flex items-center gap-2 rounded-xl bg-brand-blue px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-brand-blue-dark"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {t('joinTribune')}
        </button>
      </div>

      {showJoinModal && (
        <JoinTribuneModal
          userId={user?.id ?? null}
          memberCommunityIds={Array.from(joinedIds)}
          onClose={() => setShowJoinModal(false)}
        />
      )}
    </div>
  );
}

function ScrollSection({
  title,
  scrollRef,
  onScroll,
  canScrollLeft,
  canScrollRight,
  children,
}: {
  title: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  children: React.ReactNode;
}) {
  const scroll = (dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -280 : 280, behavior: 'smooth' });
  };

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{title}</h2>
        <div className="flex gap-1">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400 disabled:opacity-0"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400 disabled:opacity-0"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex gap-4 overflow-x-auto scroll-smooth scrollbar-none"
      >
        {children}
      </div>
    </div>
  );
}
