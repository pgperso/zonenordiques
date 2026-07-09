'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { AdSlot } from './AdSlot';

// Session-scoped: once a member actively closes the anchor, keep it closed on
// every page for the rest of the visit (fixes "I close it and it comes back").
const STORAGE_KEY = 'zn_anchor_closed';

/**
 * Mobile bottom anchor ad. The ad loads inside a collapsed (max-h-0) wrapper
 * and only slides into view — with its close button — once AdSense confirms a
 * fill. That means no empty container and no premature/disappearing ✕: if the
 * slot is unfilled, nothing ever appears. Matches Google's own anchor
 * behaviour (stays until the user dismisses it; dismissal persists).
 */
export function AdAnchor() {
  // Start dismissed so SSR + first client render match (nothing shown); the
  // effect then reveals it unless it was closed earlier this session.
  const [dismissed, setDismissed] = useState(true);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    let closed = false;
    try {
      closed = sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      /* storage unavailable — show */
    }
    setDismissed(closed);
  }, []);

  function closeManually() {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  if (dismissed) return null;

  return (
    <div
      className={`overflow-hidden transition-[max-height] duration-300 ease-out lg:hidden ${
        filled
          ? 'max-h-40 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1e1e1e]'
          : 'max-h-0'
      }`}
    >
      <div className="relative flex justify-center py-1">
        {filled && (
          <button
            onClick={closeManually}
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
