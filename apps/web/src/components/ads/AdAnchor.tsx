'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { AdSlot } from './AdSlot';

// Session-scoped: once a member actively closes the anchor, keep it closed on
// every page for the rest of the visit (fixes "I close it and it comes back").
const STORAGE_KEY = 'zn_anchor_closed';

/**
 * Mobile bottom anchor ad. Matches Google's own anchor behaviour: it stays
 * visible until the user dismisses it (no auto-dismiss timer — verified
 * against AdSense docs), and dismissal persists for the session.
 */
export function AdAnchor() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let closed = false;
    try {
      closed = sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      /* storage unavailable — fall through and show */
    }
    if (closed) {
      setDismissed(true);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  function closeManually() {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  if (!visible || dismissed) return null;

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1e1e1e] lg:hidden">
      <div className="relative flex justify-center py-1">
        {/* Clear close button — a visible ✕ with a white halo + high z-index
            so it always reads on top of the ad. */}
        <button
          onClick={closeManually}
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
