'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { createClient } from '@/lib/supabase/client';

/**
 * Does the current session come from a password-recovery link? Supabase records
 * the authentication method in the access token's `amr` claim; a session
 * started by clicking the reset email carries `recovery`. Only then may the
 * password be set without knowing the current one.
 */
function sessionIsRecovery(accessToken: string): boolean {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const amr = payload?.amr as { method?: string }[] | undefined;
    return Array.isArray(amr) && amr.some((m) => m?.method === 'recovery');
  } catch {
    return false;
  }
}

export default function UpdatePasswordPage() {
  const t = useTranslations('auth');
  const isFr = useLocale() === 'fr';
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [needsCurrent, setNeedsCurrent] = useState<boolean | null>(null); // null = resolving
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Security: a normal (non-recovery) session must prove it knows the CURRENT
  // password before setting a new one — otherwise a stolen/hijacked session
  // (shared computer, XSS-exfiltrated cookie) becomes a permanent takeover.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setNeedsCurrent(true);
        return;
      }
      setEmail(session.user.email ?? null);
      setNeedsCurrent(!sessionIsRecovery(session.access_token));
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }

    setLoading(true);
    const supabase = createClient();

    // Re-authenticate with the current password when this isn't a recovery flow.
    if (needsCurrent) {
      if (!email || !currentPassword) {
        setError(isFr ? 'Mot de passe actuel requis.' : 'Current password required.');
        setLoading(false);
        return;
      }
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
      if (reauthError) {
        setError(isFr ? 'Mot de passe actuel incorrect.' : 'Current password is incorrect.');
        setLoading(false);
        return;
      }
    }

    // `current_password` is also sent so the change still works when Supabase's
    // "Require current password when updating" is enabled server-side (that
    // setting is what closes the stolen-session case, which the client-side
    // re-auth above cannot). Omitted on the recovery path, where the user
    // legitimately doesn't know it.
    const { error } = await supabase.auth.updateUser(
      needsCurrent ? { password, current_password: currentPassword } : { password },
    );

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // A password change should evict every OTHER session (a hijacker's, an old
    // device's); this one stays signed in.
    await supabase.auth.signOut({ scope: 'others' }).catch(() => {});

    setSuccess(true);
    setLoading(false);
    setTimeout(() => router.push('/'), 2000);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {t('newPassword')}
            </h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {t('newPasswordSubtitle')}
            </p>
          </div>

          {success ? (
            <div className="rounded-lg bg-green-50 p-4 text-center text-sm text-green-700">
              <p className="font-medium">{t('passwordUpdated')}</p>
              <p className="mt-1">{t('redirecting')}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}
              {needsCurrent && (
                <div>
                  <label htmlFor="current" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {isFr ? 'Mot de passe actuel' : 'Current password'}
                  </label>
                  <input
                    id="current"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
                  />
                </div>
              )}
              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('newPassword')}
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
                  placeholder={t('minChars')}
                />
              </div>
              <div>
                <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('confirmPassword')}
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
                  placeholder={t('retypePassword')}
                />
              </div>
              <button
                type="submit"
                disabled={loading || needsCurrent === null}
                className="w-full rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
              >
                {loading ? t('updating') : t('updatePassword')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
