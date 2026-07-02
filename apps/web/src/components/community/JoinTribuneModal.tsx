'use client';

import { useState, useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useSupabase } from '@/hooks/useSupabase';
import { useModalA11y } from '@/hooks/useModalA11y';
import { Avatar } from '@/components/ui/Avatar';
import { displayCommunityName, displayCommunityDescription } from '@arena/shared';
import Image from 'next/image';
import { BRAND } from '@/lib/brand';
import type { Database } from '@arena/supabase-client';

type CategoryRow = Database['public']['Tables']['categories']['Row'];
type CommunityRow = Database['public']['Tables']['communities']['Row'] & {
  name_en?: string | null;
  description_en?: string | null;
};

interface JoinTribuneModalProps {
  userId: string | null;
  memberCommunityIds: number[];
  onClose: () => void;
}

export function JoinTribuneModal({ userId, memberCommunityIds, onClose }: JoinTribuneModalProps) {
  const supabase = useSupabase();
  const router = useRouter();
  const t = useTranslations();
  const locale = useLocale();
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [communities, setCommunities] = useState<CommunityRow[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const modalRef = useModalA11y();

  useEffect(() => {
    async function load() {
      const [{ data: cats }, { data: coms }] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('communities').select('id, name, name_en, slug, description, description_en, logo_url, primary_color, member_count, category_id, is_active').eq('is_active', true),
      ]);
      setCategories((cats ?? []) as CategoryRow[]);
      // name_en / description_en come from migration 00053. Cast through unknown
      // until generated Supabase types are regenerated post-deploy.
      setCommunities((coms ?? []) as unknown as CommunityRow[]);
      setLoading(false);
    }
    load();
  }, [supabase]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (selectedCategory) setSelectedCategory(null);
        else onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, selectedCategory]);

  const filteredCommunities = selectedCategory
    ? communities.filter((c) => c.category_id === selectedCategory && !memberCommunityIds.includes(c.id))
    : [];


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-modal-title"
        className="mx-4 w-full max-w-md rounded-2xl bg-white dark:bg-[#1e1e1e] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-5 py-4">
          <div className="flex items-center gap-2">
            {selectedCategory && (
              <button
                onClick={() => setSelectedCategory(null)}
                className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                </svg>
              </button>
            )}
            <div>
              <h2 id="join-modal-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {selectedCategory
                  ? categories.find((c) => c.id === selectedCategory)?.name ?? t('community.backToTribunes')
                  : t('community.joinTitle')}
              </h2>
              {!selectedCategory && (
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('community.joinSubtitle')}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-[#1e1e1e] hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-[#1e1e1e]" />
              ))}
            </div>
          ) : !selectedCategory ? (
            // Step 1: Pick a category
            <div className="space-y-2">
              {categories.map((cat) => {
                const totalInCategory = communities.filter((c) => c.category_id === cat.id).length;
                const availableCount = communities.filter((c) => c.category_id === cat.id && !memberCommunityIds.includes(c.id)).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    disabled={availableCount === 0}
                    className="flex w-full items-center justify-between rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] px-4 py-4 text-left transition hover:border-brand-blue hover:bg-brand-blue/5 disabled:opacity-30"
                  >
                    <div>
                      <span className="text-base font-bold text-gray-900 dark:text-gray-100">{cat.name}</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {totalInCategory === 0
                          ? t('community.comingSoon')
                          : availableCount > 0
                            ? t('community.available', { count: availableCount })
                            : t('community.allJoined')}
                      </p>
                    </div>
                    <svg className="h-5 w-5 text-brand-blue" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                );
              })}
            </div>
          ) : (
            // Step 2: Pick a tribune
            <div className="space-y-2">
              {filteredCommunities.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  {t('community.allJoinedMessage')}
                </p>
              ) : (
                filteredCommunities.map((com) => {
                  const comName = displayCommunityName(com, locale);
                  const comDesc = displayCommunityDescription(com, locale);
                  return (
                  <button
                    key={com.id}
                    onClick={() => {
                      onClose();
                      router.push(`/tribunes/${com.slug}`);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] px-4 py-4 text-left transition hover:border-brand-blue hover:bg-brand-blue/5"
                  >
                    <Image
                      src={com.logo_url || BRAND.logo}
                      alt={comName}
                      width={40}
                      height={40}
                      className="h-10 w-10 shrink-0 object-contain"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{comName}</span>
                      {comDesc && (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">{comDesc}</p>
                      )}
                      <p className="mt-0.5 text-xs text-gray-400">{t('common.members', { count: com.member_count })}</p>
                    </div>
                    <span className="rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-medium text-white">
                      {t('community.join')}
                    </span>
                  </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
