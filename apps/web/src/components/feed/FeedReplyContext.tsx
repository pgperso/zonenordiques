'use client';

import Image from 'next/image';
import { CornerDownRight } from 'lucide-react';

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
      className="mb-0.5 flex max-w-full items-center gap-1.5 overflow-hidden rounded-md bg-gray-100 px-2 py-1 text-xs leading-tight text-gray-900 transition hover:bg-gray-200 disabled:hover:bg-gray-100 dark:bg-[#272525] dark:text-gray-300 dark:hover:bg-[#302e2e] dark:disabled:hover:bg-[#272525]"
    >
      <CornerDownRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {parentAvatarUrl ? (
        <Image
          src={parentAvatarUrl}
          alt={parentUsername}
          width={16}
          height={16}
          className="h-4 w-4 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-blue text-[9px] font-bold text-white">
          {parentUsername[0]?.toUpperCase() ?? '?'}
        </div>
      )}
      <span className="min-w-0 truncate">
        <strong className="font-semibold">{parentUsername}</strong>
        {parentContent && <span className="ml-1">{parentContent}</span>}
      </span>
    </button>
  );
}
