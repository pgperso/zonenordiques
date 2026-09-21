'use client';

import { useCallback, useEffect, useState } from 'react';

// Chrome/Android fires this before showing its own install banner. We keep it
// (a single shared instance) so both the install card and the menu button can
// trigger the same native prompt — it can only be used once.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let initialized = false;

function notify() {
  listeners.forEach((l) => l());
}

// Register the global listeners once, as early as the module loads, so we don't
// miss the (early-firing) beforeinstallprompt event.
function init() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // suppress the browser's automatic banner
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

/** Shared PWA install state + trigger. `canInstall` is false when unsupported,
 *  already installed, or the prompt was already used. */
export function usePwaInstall() {
  const [, force] = useState(0);

  useEffect(() => {
    init();
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const isStandalone =
    typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches;
  const canInstall = deferred !== null && !isStandalone;

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferred) return false;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    deferred = null;
    notify();
    return choice.outcome === 'accepted';
  }, []);

  return { canInstall, promptInstall };
}
