'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { AdSlot } from './AdSlot';

/**
 * Mobile bottom anchor ad.
 *
 * The AdSlot is rendered in a normal (non-collapsed) container so AdSense
 * reliably fills it. The close ✕ is always shown while the anchor is on screen
 * (gating it on a 'filled' signal proved unreliable — the ad renders but the
 * status isn't always reported, leaving the member with no way to close it).
 * When the slot is unfilled, AdSlot returns null AND we collapse the whole
 * anchor, so there's no framed empty box left behind.
 *
 * Dismissal is NOT persisted: closing hides it only while the page stays
 * mounted, so the anchor reappears every time the member re-enters the chat.
 */
export function AdAnchor() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1e1e1e] lg:hidden">
      <div className="relative flex justify-center py-1">
        <button
          onClick={() => setDismissed(true)}
          className="absolute right-1 top-1 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 text-white shadow-lg ring-2 ring-white transition hover:bg-gray-700 dark:ring-[#1e1e1e]"
          aria-label="Fermer la publicité"
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
        <AdSlot
          slotId="mobile-anchor"
          format="large-mobile-banner"
          className="w-full max-w-md"
          onStatusChange={(s) => { if (s === 'unfilled') setDismissed(true); }}
        />
      </div>
    </div>
  );
}
