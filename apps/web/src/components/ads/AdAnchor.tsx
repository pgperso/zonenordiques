'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { AdSlot } from './AdSlot';

const AUTO_DISMISS_SECONDS = 30;
// Session-scoped: once a member actively closes the anchor, keep it closed on
// every page for the rest of the visit (fixes "I close it and it comes back").
const STORAGE_KEY = 'zn_anchor_closed';

export function AdAnchor() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_DISMISS_SECONDS);

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

  // Auto-dismiss after the countdown. This is passive (not persisted), so it
  // can reappear on a later page — only an explicit close sticks.
  useEffect(() => {
    if (!visible || dismissed) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setDismissed(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [visible, dismissed]);

  function closeManually() {
    try {
      sessionStorage.setItem(STORAGE_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  if (!visible || dismissed) return null;

  // Countdown ring around the close button.
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const progress = (countdown / AUTO_DISMISS_SECONDS) * circumference;

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1e1e1e] lg:hidden">
      <div className="relative flex justify-center py-1">
        {/* Clear close button — a visible ✕ with the countdown as a ring, a
            white halo + high z-index so it always reads on top of the ad. */}
        <button
          onClick={closeManually}
          className="absolute right-1 top-1 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-gray-800 text-white shadow-lg ring-2 ring-white transition hover:bg-gray-700 dark:ring-[#1e1e1e]"
          aria-label="Fermer la publicité"
        >
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r={radius} fill="none" stroke="white" strokeOpacity="0.25" strokeWidth="2.5" />
            <circle
              cx="18" cy="18" r={radius} fill="none" stroke="white" strokeWidth="2.5"
              strokeDasharray={circumference} strokeDashoffset={circumference - progress}
              strokeLinecap="round"
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          <X className="relative h-4 w-4" strokeWidth={2.5} />
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
