'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Download, X } from 'lucide-react';
import { BRAND } from '@/lib/brand';
import { usePwaInstall } from '@/hooks/usePwaInstall';

const SNOOZE_KEY = 'pwa-install-snoozed-at';
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Opt-in PWA install card. Instead of Chrome's surprise banner (suppressed in
 * usePwaInstall), we offer a clear, dismissible "install this site as an app"
 * card. Closing it snoozes for 30 days (not forever) — and a permanent
 * "Install" entry stays in the mobile menu. Never shows when already installed
 * or unsupported.
 */
export function InstallPwaPrompt() {
  const isFr = useLocale() === 'fr';
  const { canInstall, promptInstall } = usePwaInstall();
  const [snoozed, setSnoozed] = useState(true); // assume snoozed until we read storage

  useEffect(() => {
    try {
      const at = Number(localStorage.getItem(SNOOZE_KEY));
      setSnoozed(Number.isFinite(at) && at > 0 && Date.now() - at < SNOOZE_MS);
    } catch {
      setSnoozed(false);
    }
  }, []);

  const snooze = () => {
    setSnoozed(true);
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch { /* ignore */ }
  };

  const install = async () => {
    await promptInstall();
    snooze(); // whatever the choice, don't re-show the card right away
  };

  if (!canInstall || snoozed) return null;

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
        onClick={snooze}
        aria-label={isFr ? 'Fermer' : 'Close'}
        className="shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
