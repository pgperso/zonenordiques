'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import { useSupabase } from '@/hooks/useSupabase';

// A chat_message whose content is this sentinel is rendered as the pool promo
// card (see FeedItem). Posted by the staff-only "/pool" slash command.
export const POOL_PROMO_SENTINEL = '::pool-promo::';

interface PoolPromoCardProps {
  messageId: number;
  userId: string | null;
  canModerate?: boolean;
}

export function PoolPromoCard({ messageId, userId, canModerate }: PoolPromoCardProps) {
  const t = useTranslations('pool');
  const tc = useTranslations('common');
  const supabase = useSupabase();
  const [removed, setRemoved] = useState(false);

  if (removed) return null;

  async function handleRemove() {
    await supabase
      .from('chat_messages')
      .update({ is_removed: true, removed_at: new Date().toISOString(), removed_by: userId } as never)
      .eq('id', messageId);
    setRemoved(true);
  }

  return (
    <div className="px-4 py-3">
      <Link
        href="/lnh/pool"
        className="block max-w-md overflow-hidden rounded-xl bg-gray-950 shadow-sm transition hover:opacity-95"
      >
        {/* Banner */}
        <div className="relative h-40 w-full">
          <Image
            src="/images/bg_pool.png"
            alt={t('navTitle')}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 448px"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/50 to-transparent" />
          <span className="absolute left-3 top-3 rounded-full bg-brand-blue/20 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-blue-light">
            POOL
          </span>
        </div>

        {/* Body */}
        <div className="p-4">
          <h3 className="text-lg font-bold leading-snug text-white">
            {t.rich('bannerTitle', { b: (chunks) => <span className="text-brand-blue-light">{chunks}</span> })}
          </h3>
          <p className="mt-1 text-sm text-gray-400">{t('tagline')}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white">
            {t('cta')}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </span>
        </div>
      </Link>

      {canModerate && (
        <div className="mt-1 flex pl-1">
          <button
            onClick={handleRemove}
            className="ml-auto rounded-full px-2 py-1 text-xs text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            {tc('remove')}
          </button>
        </div>
      )}
    </div>
  );
}
