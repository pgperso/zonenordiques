'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';

/**
 * Newsletter signup band. Posts to /api/newsletter/subscribe, which sends a
 * double opt-in confirmation email. Includes a hidden honeypot field
 * (`website`) to trap bots.
 */
export function NewsletterSignup() {
  const t = useTranslations('newsletter');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — must stay empty
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, locale, website }),
      });
      if (res.ok) {
        toast.success(t('success'));
        setEmail('');
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(data.error || t('error'));
      }
    } catch {
      toast.error(t('error'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-[#161616]">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-6 text-center sm:flex-row sm:justify-between sm:gap-6 sm:text-left">
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full bg-brand-blue/10 p-2 text-brand-blue sm:inline-flex dark:bg-brand-blue/20">
            <Mail className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{t('title')}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('subtitle')}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex w-full max-w-sm items-center gap-2 sm:w-auto">
          {/* Honeypot: visually hidden, off-screen, not tab-focusable. */}
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
          />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('placeholder')}
            aria-label={t('placeholder')}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue dark:border-gray-700 dark:bg-[#1e1e1e] dark:text-gray-100 sm:w-56"
          />
          <button
            type="submit"
            disabled={loading}
            className="shrink-0 rounded-lg bg-brand-orange px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? t('sending') : t('cta')}
          </button>
        </form>
      </div>
    </div>
  );
}
