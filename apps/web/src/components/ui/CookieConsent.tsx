'use client';

import { useState, useEffect } from 'react';
import { Link } from '@/i18n/navigation';
import { useLocale } from 'next-intl';

const COOKIE_KEY = 'ft_cookie_consent';
const CONSENT_ACCEPTED_EVENT = 'ft-cookie-consent-accepted';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const locale = useLocale();
  const isFr = locale === 'fr';

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_KEY);
    if (!consent) setVisible(true);
  }, []);

  function accept() {
    localStorage.setItem(COOKIE_KEY, 'accepted');
    setVisible(false);
    const w = window as typeof window & { gtag?: (...args: unknown[]) => void };
    w.gtag?.('consent', 'update', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted',
    });
    window.dispatchEvent(new CustomEvent(CONSENT_ACCEPTED_EVENT));
  }

  function decline() {
    localStorage.setItem(COOKIE_KEY, 'declined');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6">
      <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] p-4 shadow-lg sm:p-5">
        <p className="mb-3 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {isFr
            ? 'Ce site utilise des cookies, notamment pour la publicité personnalisée via Google AdSense. En acceptant, vous consentez à l\u2019utilisation de cookies conformément à notre '
            : 'This site uses cookies, including for personalized advertising via Google AdSense. By accepting, you consent to the use of cookies in accordance with our '}
          <Link
            href="/politique-confidentialite"
            className="text-brand-blue hover:underline font-medium"
          >
            {isFr ? 'politique de confidentialité' : 'privacy policy'}
          </Link>
          .
        </p>
        <div className="flex gap-3">
          <button
            onClick={accept}
            className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-blue-dark"
          >
            {isFr ? 'Accepter' : 'Accept'}
          </button>
          <button
            onClick={decline}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-5 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {isFr ? 'Refuser' : 'Decline'}
          </button>
        </div>
      </div>
    </div>
  );
}
