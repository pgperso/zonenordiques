'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Download, X } from 'lucide-react';
import { BRAND } from '@/lib/brand';

// Chrome/Android fires this instead of showing its own install banner once we
// call preventDefault() — we keep it and trigger it from our own button.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'pwa-install-dismissed';

/**
 * Opt-in PWA install card. Instead of Chrome's surprise bottom banner, we
 * suppress it and offer a clear, dismissible "install this site as an app"
 * prompt the visitor chooses to act on. Only appears where the browser supports
 * it (Android Chrome/Edge), never when already installed or previously dismissed.
 */
export function InstallPwaPrompt() {
  const isFr = useLocale() === 'fr';
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Already installed (launched standalone) → never prompt.
    if (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      /* private mode: just proceed */
    }

    const onPrompt = (e: Event) => {
      e.preventDefault(); // suppress the automatic banner
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => {
      setShow(false);
      try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => {});
    setDeferred(null);
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[70] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-[#252525]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={BRAND.logoPngPath} alt="" className="h-11 w-11 shrink-0 rounded-lg object-contain" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {isFr ? `Installer ${BRAND.name}` : `Install ${BRAND.name}`}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {isFr
            ? 'Accès rapide en plein écran, comme une appli. Aucun téléchargement.'
            : 'Quick full-screen access, like an app. No download.'}
        </p>
      </div>
      <button
        onClick={install}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
      >
        <Download className="h-4 w-4" />
        {isFr ? 'Installer' : 'Install'}
      </button>
      <button
        onClick={dismiss}
        aria-label={isFr ? 'Fermer' : 'Close'}
        className="shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
