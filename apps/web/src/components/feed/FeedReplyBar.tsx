'use client';

import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';

interface FeedReplyBarProps {
  username: string;
  preview?: string | null;
  onCancel: () => void;
}

export function FeedReplyBar({ username, preview, onCancel }: FeedReplyBarProps) {
  const t = useTranslations('tribune');
  return (
    <div className="flex shrink-0 items-center gap-2 border-l-2 border-brand-blue bg-gray-100 dark:bg-[#1e1e1e] px-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
          {t('replyToLabel')} <strong className="font-semibold text-gray-700 dark:text-gray-300">@{username}</strong>
          {preview && (
            <span className="ml-1.5 text-gray-400">— {preview}</span>
          )}
        </p>
      </div>
      <button
        onClick={onCancel}
        className="flex-shrink-0 rounded p-0.5 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
