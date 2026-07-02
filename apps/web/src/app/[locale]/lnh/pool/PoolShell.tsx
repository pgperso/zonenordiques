import type { ReactNode } from 'react';
import { AdSidebar } from '@/components/ads/AdSidebar';
import { AdAnchor } from '@/components/ads/AdAnchor';
import { AdBanner } from '@/components/ads/AdBanner';
import { PoolNav } from './PoolNav';

/** One single content width for ALL pool pages — same chrome everywhere. */
export const POOL_MAX_W = 'max-w-5xl';

/**
 * Shared shell for every pool page: [ad left] | content | [ad right] + mobile
 * anchor + a bottom leaderboard. Every page gets the exact same width and ad
 * layout so navigation feels consistent.
 */
export function PoolShell({
  children,
  bottomAd = true,
}: {
  children: ReactNode;
  bottomAd?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 overflow-hidden border-t border-gray-200 dark:border-gray-700">
        <AdSidebar position="left" />
        <main className="flex-1 overflow-y-auto bg-white dark:bg-[#1e1e1e]">
          <div className={`mx-auto w-full ${POOL_MAX_W} px-4 py-6`}>
            <div className="mb-6 border-b border-gray-200 pb-3 dark:border-gray-700">
              <PoolNav />
            </div>
            {children}
            {bottomAd && <AdBanner className="mt-8" />}
          </div>
        </main>
        <AdSidebar position="right" />
      </div>
      <AdAnchor />
    </div>
  );
}
