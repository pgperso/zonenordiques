'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { AdSlot } from './AdSlot';

/**
 * Mobile bottom anchor ad.
 *
 * The AdSlot is rendered in a normal (non-collapsed) container so AdSense
 * reliably fills it — a zero-height wrapper stops Google from serving. We only
 * add the visible chrome (top border + close ✕) once the slot reports a fill,
 * so an unfilled slot just collapses (AdSlot returns null) instead of leaving a
 * framed empty box with a dangling ✕.
 *
 * Dismissal is NOT persisted: closing hides it only while the page stays
 * mounted, so the anchor reappears every time the member re-enters the chat.
 */
export function AdAnchor() {
  const [dismissed, setDismissed] = useState(false);
  const [filled, setFilled] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className={`shrink-0 lg:hidden ${
        filled ? 'border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1e1e1e]' : ''
      }`}
    >
      <div className="relative flex justify-center py-1">
        {filled && (
          <button
            onClick={() => setDismissed(true)}
            className="absolute right-1 top-1 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 text-white shadow-lg ring-2 ring-white transition hover:bg-gray-700 dark:ring-[#1e1e1e]"
            aria-label="Fermer la publicité"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        )}
        <AdSlot
          slotId="mobile-anchor"
          format="large-mobile-banner"
          className="w-full max-w-md"
          onStatusChange={(s) => {
            if (s === 'filled') setFilled(true);
            else if (s === 'unfilled') setDismissed(true);
          }}
        />
      </div>
    </div>
  );
}
