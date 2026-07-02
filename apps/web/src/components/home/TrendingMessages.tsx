'use client';

import { useState, useEffect, useMemo } from 'react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { Heart, Annoyed, Flame } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { formatTime } from '@arena/shared';

interface TrendingMessage {
  id: number;
  content: string;
  likeCount: number;
  dislikeCount: number;
  createdAt: string;
  username: string;
  avatarUrl: string | null;
  communityName: string;
  communitySlug: string;
}

interface TrendingMessagesProps {
  popular: TrendingMessage[];
  controversial: TrendingMessage[];
}

export function TrendingMessages({ popular, controversial }: TrendingMessagesProps) {
  const t = useTranslations('home');
  const allMessages = useMemo(() => [
    ...popular.map((msg) => ({ ...msg, variant: 'popular' as const })),
    ...controversial.map((msg) => ({ ...msg, variant: 'controversial' as const })),
  ], [popular, controversial]);

  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (allMessages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((i) => (i + 1) % allMessages.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [allMessages.length]);

  if (allMessages.length === 0) return null;

  const msg = allMessages[currentIndex];
  const isPopular = msg.variant === 'popular';

  return (
    <div className="mx-auto mb-12 max-w-2xl">
      <div className="overflow-hidden rounded-2xl bg-gray-950">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-brand-orange" strokeWidth={2.5} />
            <span className="text-sm font-bold tracking-wide uppercase text-gray-400">
              {t('rightNow')}
            </span>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            isPopular
              ? 'bg-red-500/20 text-red-400'
              : 'bg-orange-500/20 text-orange-400'
          }`}>
            {isPopular ? t('popular') : t('controversial')}
          </span>
        </div>

        {/* Message — fade transition */}
        <Link
          key={msg.id}
          href={`/tribunes/${msg.communitySlug}`}
          className="block px-5 py-5 transition-opacity duration-500 animate-[fade-in_0.5s_ease-out]"
        >
          <div className="mb-3 flex items-center gap-2.5">
            <Avatar url={msg.avatarUrl} name={msg.username} size="sm" />
            <div className="min-w-0 flex-1">
              <span className="text-sm font-bold text-white">{msg.username}</span>
              <span className="ml-2 text-xs font-medium text-gray-500 dark:text-gray-400">{msg.communityName}</span>
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-400">{formatTime(msg.createdAt)}</span>
          </div>
          <p className="line-clamp-2 text-sm leading-relaxed text-gray-300">{msg.content}</p>
          <div className="mt-3 flex items-center gap-4 text-xs">
            <span className={`flex items-center gap-1 font-semibold ${isPopular ? 'text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
              <Heart className="h-3.5 w-3.5" fill={isPopular ? 'currentColor' : 'none'} strokeWidth={1.5} />
              {msg.likeCount}
            </span>
            <span className={`flex items-center gap-1 font-semibold ${!isPopular ? 'text-orange-400' : 'text-gray-600 dark:text-gray-400'}`}>
              <Annoyed className="h-3.5 w-3.5" fill={!isPopular ? 'currentColor' : 'none'} strokeWidth={1.5} />
              {msg.dislikeCount}
            </span>
          </div>
        </Link>

        {/* Progress bar */}
        {allMessages.length > 1 && (
          <div className="flex gap-1 px-5 pb-4">
            {allMessages.map((_, i) => (
              <div key={i} className="h-0.5 flex-1 overflow-hidden rounded-full bg-white dark:bg-[#1e1e1e]/5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    i === currentIndex ? 'w-full bg-brand-orange' : i < currentIndex ? 'w-full bg-white dark:bg-[#1e1e1e]/10' : 'w-0'
                  }`}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
