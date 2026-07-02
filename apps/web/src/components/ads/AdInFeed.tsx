'use client';

import { AdSlot } from './AdSlot';

interface AdInFeedProps {
  index: number;
}

export function AdInFeed({ index }: AdInFeedProps) {
  return (
    <div className="bg-ad-bg dark:bg-[#1e1e1e] px-4 py-3">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-400">
        Sponsorisé
      </p>
      <AdSlot
        slotId={`feed-ad-${index}`}
        format="in-feed"
        layoutKey="-gw-3+1f-3d+2z"
        className="w-full"
      />
    </div>
  );
}
