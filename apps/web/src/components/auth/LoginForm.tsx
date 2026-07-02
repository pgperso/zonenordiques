'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function resolveIdentifierToEmail(raw: string): Promise<string | null> {
    const trimmed = raw.trim();
    if (trimmed.includes('@')) return trimmed;
    const supabase = createClient();
    const { data, error } = await supabase.rpc('get_email_from_username', {
      uname: trimmed,
    });
    if (error || !data) return null;
    return data;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const email = await resolveIdentifierToEmail(identifier);
    if (!email) {
      setError(t('invalidCredentials'));
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (!authError) {
      router.push('/');
      router.refresh();
      return;
    }

    // Standard sign-in failed — try the legacy MD5 fallback for users imported
    // from the old Zone Nordiques site. If the MD5 of `password` matches their
    // stored legacy hash, the endpoint migrates them to bcrypt and we re-try.
    const legacyRes = await fetch('/api/auth/legacy-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
    });

    if (legacyRes.ok) {
      const legacyData = (await legacyRes.json()) as { ok?: boolean };
      if (legacyData.ok) {
        const { error: retryError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (!retryError) {
          router.push('/');
          router.refresh();
          return;
        }
      }
    }

    setError(t('invalidCredentials'));
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        {t('legacyImportNotice')}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label htmlFor="identifier" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('identifier')}
        </label>
        <input
          id="identifier"
          type="text"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue focus:outline-none"
          placeholder={t('identifierPlaceholder')}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('password')}
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 pr-10 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue focus:outline-none"
            placeholder={t('passwordPlaceholder')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? t('hidePassword') : t('showPassword')}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 transition hover:text-gray-600 dark:hover:text-gray-300"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-blue-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? `${t('login')}...` : t('loginAction')}
      </button>

      <div className="flex items-center justify-between text-sm">
        <Link href="/reset-password" className="text-brand-blue hover:underline">
          {t('forgotPassword')}
        </Link>
        <Link href="/register" className="text-brand-blue hover:underline">
          {t('createAccount')}
        </Link>
      </div>
    </form>
  );
}
