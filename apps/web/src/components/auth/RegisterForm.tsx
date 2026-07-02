'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { validateUsername, validateEmail, validatePassword } from '@arena/shared';

export function RegisterForm() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const usernameError = validateUsername(username);
    if (usernameError) {
      setError(usernameError);
      return;
    }

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: username,
        },
      },
    });

    if (authError) {
      if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
        setError('Ce courriel est déjà utilisé. Essayez « Mot de passe oublié » pour récupérer votre compte.');
      } else if (authError.message.includes('rate') || authError.message.includes('limit') || authError.message.includes('exceeded')) {
        setError('Trop de tentatives. Veuillez réessayer dans quelques minutes.');
      } else if (authError.message.includes('email') && authError.message.includes('send')) {
        setError('Impossible d\'envoyer le courriel de confirmation. Veuillez réessayer plus tard.');
      } else {
        setError(`Une erreur est survenue : ${authError.message}`);
      }
      setLoading(false);
      return;
    }

    router.push('/login?registered=true');
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div>
        <label htmlFor="username" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('username')}
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue focus:outline-none"
          placeholder={t('usernamePlaceholder')}
        />
      </div>

      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('email')}
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue focus:outline-none"
          placeholder={t('emailPlaceholder')}
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
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 pr-10 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-brand-blue focus:ring-1 focus:ring-brand-blue focus:outline-none"
            placeholder={t('minChars')}
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
        {loading ? `${t('register')}...` : t('createAccount')}
      </button>

      <p className="text-center text-sm text-gray-500 dark:text-gray-400">
        {t('hasAccount')}{' '}
        <Link href="/login" className="text-brand-blue hover:underline">
          {t('loginAction')}
        </Link>
      </p>
    </form>
  );
}
