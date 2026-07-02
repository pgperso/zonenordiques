'use client';

import { useState, useEffect } from 'react';
import { AdSlot } from './AdSlot';

const AUTO_DISMISS_SECONDS = 30;

export function AdAnchor() {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_DISMISS_SECONDS);

  // Show after 5 seconds delay
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  // Countdown timer
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

  if (!visible || dismissed) return null;

  // SVG circle progress (28px button, 2px stroke)
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const progress = (countdown / AUTO_DISMISS_SECONDS) * circumference;

  return (
    <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] lg:hidden">
      <div className="relative flex justify-center py-1">
        <button
          onClick={() => setDismissed(true)}
          className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-gray-700 text-white shadow transition hover:bg-gray-600"
          aria-label="Fermer la publicité"
        >
          {/* Circular countdown */}
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 28 28">
            <circle cx="14" cy="14" r={radius} fill="none" stroke="white" strokeOpacity="0.2" strokeWidth="2" />
            <circle
              cx="14" cy="14" r={radius} fill="none" stroke="white" strokeWidth="2"
              strokeDasharray={circumference} strokeDashoffset={circumference - progress}
              strokeLinecap="round"
              className="transition-[stroke-dashoffset] duration-1000 ease-linear"
            />
          </svg>
          <span className="relative text-[10px] font-bold">{countdown}</span>
        </button>
        <AdSlot slotId="mobile-anchor" format="large-mobile-banner" className="w-full max-w-md" />
      </div>
    </div>
  );
}
