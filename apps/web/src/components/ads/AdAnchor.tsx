'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { AdSlot } from './AdSlot';

/**
 * Mobile bottom anchor ad.
 *
 * The close control lives in its OWN row ABOVE the ad — never overlapping the
 * ad iframe. A cross-origin ad iframe can paint above sibling elements on some
 * mobile browsers regardless of z-index, so an absolutely-positioned ✕ over the
 * ad gets swallowed. Giving the ✕ its own space is the robust, professional
 * pattern (it's how Google's own anchor ads place their close affordance).
 *
 * The AdSlot renders in a normal container so AdSense fills it reliably; an
 * unfilled slot collapses the whole anchor. Dismissal is not persisted, so the
 * anchor reappears every time the member re-enters the chat.
 */
export function AdAnchor() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1e1e1e] lg:hidden">
      {/* Control row above the ad — the ✕ can never be hidden by the iframe. */}
      <div className="flex items-center justify-between px-2 py-0.5">
        <span className="text-[10px] uppercase tracking-wider text-gray-400">Publicité</span>
        <button
          onClick={() => setDismissed(true)}
          className="flex h-6 items-center gap-1 rounded-full px-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-gray-700 dark:hover:text-gray-100"
          aria-label="Fermer la publicité"
        >
          <span className="text-[11px] font-semibold">Fermer</span>
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>
      <div className="flex justify-center pb-1">
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
