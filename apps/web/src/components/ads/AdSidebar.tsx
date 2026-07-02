'use client';

import { AdSlot } from './AdSlot';

interface AdSidebarProps {
  position: 'left' | 'right';
}

export function AdSidebar({ position }: AdSidebarProps) {
  return (
    <aside
      className={`hidden flex-shrink-0 xl:block ${
        position === 'left' ? 'xl:w-[180px]' : 'xl:w-[320px]'
      }`}
    >
      <div className="sticky top-16 p-2">
        {position === 'left' ? (
          <AdSlot slotId="sidebar-left" format="skyscraper" />
        ) : (
          <AdSlot slotId="sidebar-right" format="half-page" />
        )}
      </div>
    </aside>
  );
}
