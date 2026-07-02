'use client';

import Image from 'next/image';

interface FeedReplyContextProps {
  parentUsername: string;
  parentAvatarUrl?: string | null;
  parentContent?: string | null;
  onClick?: () => void;
}

export function FeedReplyContext({
  parentUsername,
  parentAvatarUrl,
  parentContent,
  onClick,
}: FeedReplyContextProps) {
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className="flex h-4 max-w-full items-center gap-1 overflow-hidden text-[11px] leading-none text-gray-400 transition hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400 disabled:hover:text-gray-400"
    >
      {parentAvatarUrl ? (
        <Image
          src={parentAvatarUrl}
          alt={parentUsername}
          width={14}
          height={14}
          className="h-3.5 w-3.5 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-blue text-[8px] font-bold text-white">
          {parentUsername[0]?.toUpperCase() ?? '?'}
        </div>
      )}
      <span className="min-w-0 truncate">
        <strong className="font-semibold text-brand-blue">{parentUsername}</strong>
        {parentContent && (
          <span className="ml-1 text-gray-400">{parentContent}</span>
        )}
      </span>
    </button>
  );
}
