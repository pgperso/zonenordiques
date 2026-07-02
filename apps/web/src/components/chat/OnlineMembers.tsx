'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Bell, BellOff } from 'lucide-react';
import type { PresenceMember } from '@/hooks/usePresence';
import { Avatar } from '@/components/ui/Avatar';
import { StatusDot } from '@/components/ui/StatusDot';
import { useSupabase } from '@/hooks/useSupabase';
import { setArticleNotificationsMuted } from '@/services/notificationService';
import { BRAND } from '@/lib/brand';

interface OnlineMembersProps {
  members: PresenceMember[];
  communityName: string;
  communityId: number;
  userId: string | null;
  articleNotifMuted: boolean;
  canModerate?: boolean;
  canCreateContent?: boolean;
  onModerate?: () => void;
  onArticle?: () => void;
  onMyArticles?: () => void;
  onPodcast?: () => void;
  onLeave?: () => void;
}

/**
 * Sidebar of a community page. Holds the online-members list and, for
 * privileged users (admin / moderator / creator), a second "Actions" tab
 * where the moderation + content-creation buttons live. Keeps the feed
 * toolbar minimal.
 */
export function OnlineMembers({
  members,
  communityName,
  communityId,
  userId,
  articleNotifMuted,
  canModerate = false,
  canCreateContent = false,
  onModerate,
  onArticle,
  onMyArticles,
  onPodcast,
  onLeave,
}: OnlineMembersProps) {
  const t = useTranslations('tribune');
  const tr = useTranslations('roles');
  const tn = useTranslations('notifications');
  const botName = tr('bot');
  const supabase = useSupabase();

  // Per-tribune article-notification mute. Lets a member who only lurks
  // here silence "new article" bell notifications without leaving.
  const [muted, setMuted] = useState(articleNotifMuted);
  const [savingMute, setSavingMute] = useState(false);

  async function toggleMute() {
    if (!userId || savingMute) return;
    const next = !muted;
    setMuted(next);
    setSavingMute(true);
    const { error } = await setArticleNotificationsMuted(supabase, userId, communityId, next);
    if (error) setMuted(!next); // revert on failure
    setSavingMute(false);
  }

  const hasActions =
    (canModerate && !!onModerate) ||
    (canCreateContent && (!!onArticle || !!onMyArticles || !!onPodcast)) ||
    !!onLeave;

  const [tab, setTab] = useState<'members' | 'actions'>('members');

  // Sort members: online first, then idle
  const sorted = [...members].sort((a, b) => {
    if (a.status === 'online' && b.status === 'idle') return -1;
    if (a.status === 'idle' && b.status === 'online') return 1;
    return 0;
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header: tribune name + online count */}
      <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
          {communityName}
        </h3>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {t('online', { count: members.length + 1 })}
        </p>
      </div>

      {/* Per-tribune article-notification toggle — on = you get the bell
          alert when an article is published here. */}
      {userId && (
        <button
          type="button"
          onClick={toggleMute}
          disabled={savingMute}
          aria-pressed={!muted}
          className="flex w-full shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-2.5 text-left transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          <span className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            {muted
              ? <BellOff className="h-4 w-4 text-gray-400" aria-hidden="true" />
              : <Bell className="h-4 w-4 text-brand-blue" aria-hidden="true" />}
            {tn('muteArticlesLabel')}
          </span>
          <span
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              muted ? 'bg-gray-300 dark:bg-gray-600' : 'bg-brand-blue'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                muted ? 'left-0.5' : 'left-[18px]'
              }`}
            />
          </span>
        </button>
      )}

      {/* Tabs: Members / Actions (only when the user has something to do) */}
      {hasActions && (
        <div className="flex shrink-0 gap-1 border-b border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-[#1e1e1e]">
          <button
            onClick={() => setTab('members')}
            className={`flex flex-1 items-center justify-center rounded-md py-1.5 text-xs font-semibold transition ${
              tab === 'members'
                ? 'bg-white text-brand-blue shadow-sm dark:bg-[#272525] dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {t('tabMembers')}
          </button>
          <button
            onClick={() => setTab('actions')}
            className={`flex flex-1 items-center justify-center rounded-md py-1.5 text-xs font-semibold transition ${
              tab === 'actions'
                ? 'bg-white text-brand-blue shadow-sm dark:bg-[#272525] dark:text-white'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {t('tabActions')}
          </button>
        </div>
      )}

      {/* Members list */}
      {tab === 'members' && (
        <div className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1">
            {/* Bot — always online */}
            <li className="flex items-center gap-2 rounded-lg px-2 py-1.5">
              <div className="relative">
                <Image
                  src={BRAND.logo}
                  alt={botName}
                  width={28}
                  height={28}
                  className="h-7 w-7 object-contain"
                />
                <StatusDot status="online" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-gray-700 dark:text-gray-300">{botName}</span>
                <span className="rounded-full bg-brand-blue px-1 py-px text-[8px] font-bold text-white">Bot</span>
              </div>
            </li>

            {sorted.map((member) => (
              <li key={member.memberId} className="flex items-center gap-2 rounded-lg px-2 py-1.5">
                <div className="relative">
                  <Avatar url={member.avatarUrl} name={member.username} size="sm" />
                  <StatusDot status={member.status} />
                </div>
                <span className={`truncate text-sm ${member.status === 'idle' ? 'text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
                  {member.username}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      {tab === 'actions' && hasActions && (
        <div className="flex-1 overflow-y-auto p-3">
          <ul className="space-y-1.5">
            {canCreateContent && onArticle && (
              <li>
                <ActionButton
                  onClick={onArticle}
                  label={t('article')}
                  variant="purple"
                  icon={
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                    />
                  }
                />
              </li>
            )}
            {canCreateContent && onMyArticles && (
              <li>
                <ActionButton
                  onClick={onMyArticles}
                  label={t('myArticles')}
                  variant="gray"
                  icon={
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
                    />
                  }
                />
              </li>
            )}
            {canCreateContent && onPodcast && (
              <li>
                <ActionButton
                  onClick={onPodcast}
                  label={t('podcast')}
                  variant="orange"
                  icon={
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
                    />
                  }
                />
              </li>
            )}
            {canModerate && onModerate && (
              <li>
                <ActionButton
                  onClick={onModerate}
                  label={t('moderate')}
                  variant="red"
                  icon={
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                    />
                  }
                />
              </li>
            )}
            {onLeave && (
              <li className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <ActionButton
                  onClick={onLeave}
                  label={t('leaveAction')}
                  variant="muted"
                  icon={
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"
                    />
                  }
                />
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

type Variant = 'purple' | 'red' | 'orange' | 'gray' | 'muted';

const VARIANT_CLASSES: Record<Variant, string> = {
  purple: 'bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-300 dark:hover:bg-purple-900',
  red: 'bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300 dark:hover:bg-red-900',
  orange: 'bg-orange-50 text-orange-700 hover:bg-orange-100 dark:bg-orange-950 dark:text-orange-300 dark:hover:bg-orange-900',
  gray: 'bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700',
  muted: 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800',
};

function ActionButton({
  onClick,
  label,
  variant,
  icon,
}: {
  onClick: () => void;
  label: string;
  variant: Variant;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${VARIANT_CLASSES[variant]}`}
    >
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
        {icon}
      </svg>
      <span className="truncate">{label}</span>
    </button>
  );
}
