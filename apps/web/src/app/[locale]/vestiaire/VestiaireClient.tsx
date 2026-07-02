'use client';

import { useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui/Avatar';
import { useAvatarUpload } from '@/hooks/useAvatarUpload';
import { displayCommunityName, formatTime } from '@arena/shared';
import { PollAdminPanel } from './PollAdminPanel';
import { BRAND } from '@/lib/brand';
import type { Poll } from '@/services/pollService';
import type { Database } from '@arena/supabase-client';

type CommunityRow = Database['public']['Tables']['communities']['Row'];

interface MemberProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  description: string | null;
  creator_display_name: string | null;
  creator_avatar_url: string | null;
  created_at: string;
}

interface AdminStats {
  articles: number;
  drafts: number;
  podcasts: number;
}

export interface AuthorMetricsTopArticle {
  id: number;
  slug: string;
  title: string;
  viewCount: number;
  likeCount: number;
  publishedAt: string | null;
  communitySlug: string;
  communityName: string;
  communityNameEn: string | null;
}

export interface AuthorMetrics {
  publishedCount: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  topArticles: AuthorMetricsTopArticle[];
}

interface VestiaireClientProps {
  member: MemberProfile | null;
  communities: CommunityRow[];
  roleMap: Record<number, string>;
  adminStats: Record<number, AdminStats>;
  userEmail: string;
  isContentCreator: boolean;
  authorMetrics: AuthorMetrics;
  isOwner: boolean;
  pendingPolls: Poll[];
  scheduledPolls: Poll[];
  activePoll: Poll | null;
}

export function VestiaireClient({
  member,
  communities,
  roleMap,
  adminStats,
  isContentCreator,
  userEmail,
  authorMetrics,
  isOwner,
  pendingPolls,
  scheduledPolls,
  activePoll,
}: VestiaireClientProps) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('account');
  const tc = useTranslations('common');
  const ta = useTranslations('auth');
  const [savedDescription, setSavedDescription] = useState(member?.description ?? '');
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2 | 3>(0); // 0=hidden, 1=info, 2=password, 3=done
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [description, setDescription] = useState(member?.description ?? '');
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(member?.avatar_url ?? null);
  const { uploading, error: avatarError, uploadAvatar } = useAvatarUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSaveDescription() {
    if (!member) return;
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from('members')
      .update({ description })
      .eq('id', member.id);
    setSavedDescription(description);
    setSaving(false);
    router.refresh();
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !member) return;
    const url = await uploadAvatar(file, member.id);
    if (url) {
      setAvatarUrl(url);
      router.refresh();
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  }

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  if (!member) {
    return (
      <div className="py-12 text-center text-gray-500 dark:text-gray-400">
        Profil introuvable.
      </div>
    );
  }

  const joinDate = new Date(member.created_at).toLocaleDateString('fr-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-8 overflow-x-hidden">
      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 transition hover:text-gray-700 dark:hover:text-gray-300 dark:text-gray-300"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        {tc('back')}
      </button>

      {/* Profile header */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] p-6">
        <div className="flex items-start gap-4">
          <div className="flex shrink-0 flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="group relative"
            >
              <Avatar
                url={avatarUrl}
                name={member.username}
                size="xl"
              />
              <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition group-hover:bg-black/40">
                {uploading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <svg
                    className="h-5 w-5 text-white opacity-0 transition group-hover:opacity-100"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
                  </svg>
                )}
              </div>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs font-medium text-brand-blue hover:underline disabled:opacity-50"
            >
              {uploading ? 'Chargement...' : 'Modifier'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleAvatarChange}
              className="hidden"
            />
            {avatarError && (
              <p className="text-xs text-red-500">{avatarError}</p>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {member.username}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{userEmail}</p>
            <p className="mt-1 text-sm text-gray-400">
              Membre depuis le {joinDate}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="shrink-0 rounded-lg border border-gray-200 dark:border-gray-700 p-2 text-gray-600 dark:text-gray-400 transition hover:border-red-300 hover:text-red-600 sm:px-4 sm:text-sm sm:font-medium"
            title={ta('logout')}
          >
            <svg className="h-4 w-4 sm:hidden" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 9V5.25A2.25 2.25 0 0 1 10.5 3h6a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 16.5 21h-6a2.25 2.25 0 0 1-2.25-2.25V15m-3 0-3-3m0 0 3-3m-3 3H15" />
            </svg>
            <span className="hidden sm:inline">{ta('logout')}</span>
          </button>
        </div>

        {/* Bio — always visible */}
        <div className="mt-4 space-y-2">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 transition focus:border-brand-blue focus:outline-none focus:ring-1 focus:ring-brand-blue"
            rows={3}
            placeholder="Parlez-nous de vous..."
            maxLength={500}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveDescription}
              disabled={saving || description === savedDescription}
              className="rounded-lg bg-brand-blue px-4 py-1.5 text-sm font-medium text-white transition hover:bg-brand-blue-dark disabled:opacity-50"
            >
              {saving ? tc('saving') : tc('save')}
            </button>
            <button
              onClick={() => setDescription(savedDescription)}
              disabled={description === savedDescription}
              className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-[#1e1e1e] disabled:opacity-50"
            >
              {tc('cancel')}
            </button>
          </div>
        </div>
      </div>

      {/* Poll management — owner only */}
      {isOwner && (
        <>
          <PollAdminPanel
            pendingPolls={pendingPolls}
            scheduledPolls={scheduledPolls}
            activePoll={activePoll}
          />
          <Link
            href="/vestiaire/pool"
            className="mt-4 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-[#1e1e1e] dark:hover:bg-[#252525]"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Gérer le Pool LNH
            </span>
            <span className="text-sm text-gray-400">barème · règles · échanges →</span>
          </Link>
        </>
      )}

      {/* Author metrics — only shown if user has published anything */}
      {authorMetrics.publishedCount > 0 && (
        <AuthorMetricsPanel metrics={authorMetrics} locale={locale} username={member?.username ?? null} />
      )}

      {/* Communities */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
          Mes tribunes
        </h2>
        {communities.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {communities.map((community) => {
              const role = roleMap[community.id];
              return (
                <Link
                  key={community.id}
                  href={`/tribunes/${community.slug}`}
                  className="group flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] p-4 transition hover:border-gray-300 dark:border-gray-600 hover:shadow-sm"
                >
                  <Image
                    src={community.logo_url || BRAND.logo}
                    alt={community.name}
                    width={40}
                    height={40}
                    className="h-10 w-10 shrink-0 object-contain"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:text-brand-blue">
                        {community.name}
                      </h3>
                      {role && (
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          role === 'owner'
                            ? 'bg-brand-blue text-white'
                            : 'bg-brand-blue/10 text-brand-blue'
                        }`}>
                          {role === 'owner' ? 'Propriétaire' : role === 'admin' ? 'Arbitre' : 'Mod'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {community.member_count} membre
                      {community.member_count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <svg
                    className="h-5 w-5 shrink-0 text-gray-300 transition group-hover:text-brand-blue"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.25 4.5l7.5 7.5-7.5 7.5"
                    />
                  </svg>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] p-8 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Vous n&apos;avez rejoint aucune tribune.
            </p>
            <Link
              href="/"
              className="mt-3 inline-block text-sm font-medium text-brand-blue hover:underline"
            >
              Découvrir les tribunes
            </Link>
          </div>
        )}
      </div>

      {/* Admin section */}
      {Object.keys(adminStats).length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Administration
          </h2>
          <div className="space-y-3">
            {communities
              .filter((c) => adminStats[c.id])
              .map((community) => {
                const stats = adminStats[community.id];
                const role = roleMap[community.id];
                return (
                  <div
                    key={`admin-${community.id}`}
                    className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] p-4"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <Image
                        src={community.logo_url || BRAND.logo}
                        alt={community.name}
                        width={28}
                        height={28}
                        className="h-7 w-7 shrink-0 object-contain"
                      />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{community.name}</h3>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        role === 'owner'
                          ? 'bg-brand-blue text-white'
                          : 'bg-brand-blue/10 text-brand-blue'
                      }`}>
                        {role === 'owner' ? 'Propriétaire' : role === 'admin' ? 'Arbitre' : 'Mod'}
                      </span>
                    </div>
                    <div className="mb-3 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>{stats.articles} article{stats.articles !== 1 ? 's' : ''} publié{stats.articles !== 1 ? 's' : ''}</span>
                      <span>{stats.drafts} brouillon{stats.drafts !== 1 ? 's' : ''}</span>
                      <span>{stats.podcasts} podcast{stats.podcasts !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/tribunes/${community.slug}`}
                        className="rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-medium text-purple-700 transition hover:bg-purple-100"
                      >
                        Gérer les articles
                      </Link>
                      <Link
                        href={`/tribunes/${community.slug}`}
                        className="rounded-lg bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
                      >
                        Gérer les podcasts
                      </Link>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Danger zone */}
      <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6">
        <h2 className="mb-2 text-sm font-semibold text-red-700">{t('dangerZone')}</h2>
        <p className="mb-4 text-xs text-red-600/70">
          {t('deleteWarning')}
        </p>
        <button
          onClick={() => setDeleteStep(1)}
          className="rounded-lg border border-red-300 px-4 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100"
        >
          {t('deleteAccount')}
        </button>
      </div>

      {/* Delete account modal — Step 1: Information */}
      {deleteStep === 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white dark:bg-[#1e1e1e] p-6 shadow-xl">
            <h3 className="mb-3 text-lg font-bold text-gray-900 dark:text-gray-100">{t('deleteTitle')}</h3>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{t('deleteWarning')}</p>
            <ul className="mb-6 space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-red-500">•</span>
                {t('deleteItem1')}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-red-500">•</span>
                {t('deleteItem2')}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-red-500">•</span>
                {t('deleteItem3')}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 text-red-500">•</span>
                {t('deleteItem4')}
              </li>
            </ul>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteStep(0)}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-[#1e1e1e]"
              >
                {tc('cancel')}
              </button>
              <button
                onClick={() => { setDeleteStep(2); setDeleteError(''); setDeletePassword(''); }}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700"
              >
                {t('understandContinue')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account modal — Step 2: Password confirmation */}
      {deleteStep === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white dark:bg-[#1e1e1e] p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-gray-100">{t('confirmTitle')}</h3>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">{t('confirmSubtitle')}</p>

            {deleteError && (
              <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {deleteError}
              </div>
            )}

            <div className="mb-5">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('passwordLabel')}</label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder={t('passwordPlaceholder')}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteStep(0)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 transition hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-[#1e1e1e] disabled:opacity-50"
              >
                {tc('cancel')}
              </button>
              <button
                onClick={async () => {
                  if (!deletePassword) return;
                  setDeleting(true);
                  setDeleteError('');
                  try {
                    const res = await fetch('/api/auth/delete-account', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ password: deletePassword }),
                    });
                    const data = await res.json();
                    if (!res.ok) {
                      setDeleteError(data.error === 'wrong_password' ? t('wrongPassword') : t('deleteError'));
                      setDeleting(false);
                      return;
                    }
                    setDeleteStep(3);
                    setTimeout(() => router.push('/'), 2500);
                  } catch {
                    setDeleteError(t('deleteError'));
                    setDeleting(false);
                  }
                }}
                disabled={deleting || !deletePassword}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? t('deleting') : t('deleteForever')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete account modal — Step 3: Success */}
      {deleteStep === 3 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-white dark:bg-[#1e1e1e] p-6 shadow-xl text-center">
            <div className="mb-4 flex justify-center">
              <svg className="h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-bold text-gray-900 dark:text-gray-100">{t('deleted')}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('deletedDetail')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function AuthorMetricsPanel({
  metrics,
  locale,
  username,
}: {
  metrics: AuthorMetrics;
  locale: string;
  username: string | null;
}) {
  const isFr = locale === 'fr';
  const fmt = (n: number) => n.toLocaleString(isFr ? 'fr-CA' : 'en-CA');

  return (
    <section className="mb-8 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {isFr ? 'Mes articles — performance' : 'My articles — performance'}
        </h2>
        {username && (
          <Link
            href={`/auteurs/${username}`}
            className="text-xs font-medium text-brand-blue hover:underline"
          >
            {isFr ? 'Ma page publique →' : 'My public page →'}
          </Link>
        )}
      </div>

      {/* Stat tiles */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label={isFr ? 'Articles publiés' : 'Published'}
          value={fmt(metrics.publishedCount)}
        />
        <StatTile
          label={isFr ? 'Vues totales' : 'Total views'}
          value={fmt(metrics.totalViews)}
          accent="text-brand-blue"
        />
        <StatTile
          label={isFr ? "Mentions J'aime" : 'Likes'}
          value={fmt(metrics.totalLikes)}
        />
        <StatTile
          label={isFr ? 'Commentaires reçus' : 'Comments received'}
          value={fmt(metrics.totalComments)}
        />
      </div>

      {/* Top articles list */}
      {metrics.topArticles.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            {isFr ? 'Top articles (par vues)' : 'Top articles (by views)'}
          </h3>
          <ul className="space-y-1.5">
            {metrics.topArticles.map((a, idx) => (
              <li key={a.id}>
                <Link
                  href={`/tribunes/${a.communitySlug}/articles/${a.slug}`}
                  className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <span className="w-4 shrink-0 text-right text-xs font-bold text-gray-400">
                    {idx + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 group-hover:text-brand-blue dark:text-gray-100">
                    {a.title}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {displayCommunityName(
                      { name: a.communityName, name_en: a.communityNameEn },
                      locale,
                    )}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                    {fmt(a.viewCount)} {isFr ? 'vues' : 'views'}
                  </span>
                  {a.publishedAt && (
                    <span className="hidden shrink-0 text-[11px] text-gray-400 sm:inline">
                      {formatTime(a.publishedAt)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#181818] px-3 py-2.5">
      <div className={`text-xl font-bold tabular-nums ${accent ?? 'text-gray-900 dark:text-gray-100'}`}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}
