'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { formatTime, BOT_MEMBER_ID } from '@arena/shared';
import type { FeedMessage as FeedMessageType } from '@arena/shared';
import { BRAND } from '@/lib/brand';

export { BOT_MEMBER_ID };

interface FeedBotMessageProps {
  message: FeedMessageType;
}

export function FeedBotMessage({ message }: FeedBotMessageProps) {
  const t = useTranslations();
  const time = formatTime(message.createdAt);
  const botName = t('roles.bot');

  return (
    <div className="px-4 py-3">
      <div className="overflow-hidden rounded-xl bg-gray-950 px-4 py-3">
        <div className="flex items-center gap-3">
          <Image
            src={BRAND.logo}
            alt={botName}
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 object-contain"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">{botName}</span>
              <span className="rounded-full bg-brand-blue px-1.5 py-0.5 text-[9px] font-medium text-white">Bot</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{time}</span>
            </div>
            <p className="mt-0.5 text-sm text-gray-300">{message.content}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
