'use client';

import { AdSlot } from './AdSlot';

interface AdBannerProps {
  className?: string;
  slotId?: string;
}

export function AdBanner({ className = '', slotId = 'home-mid-banner' }: AdBannerProps) {
  return (
    <div className={`flex justify-center py-2 ${className}`}>
      <AdSlot
        slotId={slotId}
        format="leaderboard"
        className="max-w-full"
      />
    </div>
  );
}
