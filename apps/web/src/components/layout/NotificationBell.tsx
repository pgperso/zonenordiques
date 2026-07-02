'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useSupabase } from '@/hooks/useSupabase';
import { useTribune } from '@/contexts/TribuneContext';
import { useNotificationSound } from '@/hooks/useNotificationSound';
import { Avatar } from '@/components/ui/Avatar';
import { formatTime, displayCommunityName } from '@arena/shared';
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '@/services/notificationService';

interface NotificationBellProps {
  userId: string;
}

/**
 * Header bell icon + dropdown. A Supabase Realtime subscription keeps the
 * badge live; coalesced notifications arrive as UPDATEs (not just INSERTs),
 * so the subscription listens to every change and re-reads the authoritative
 * unread count rather than counting events optimistically.
 */
export function NotificationBell({ userId }: NotificationBellProps) {
  const t = useTranslations('notifications');
  const locale = useLocale();
  const router = useRouter();
  const supabase = useSupabase();
  const { tribune } = useTribune();
  const { enabled: soundEnabled, setEnabled: setSoundEnabled, play: playSound } = useNotificationSound();

  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // The realtime callback below needs the *current* tribune without
  // re-subscribing every time the user navigates — keep it in a ref.
  const tribuneRef = useRef(tribune);
  useEffect(() => {
    tribuneRef.current = tribune;
  }, [tribune]);

  const refreshUnread = useCallback(async () => {
    const count = await fetchUnreadNotificationCount(supabase);
    setUnread(count);
  }, [supabase]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications(supabase, 20);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // Initial count + realtime subscription. Coalescing means a new event on
  // an existing unread group is an UPDATE, so we listen to '*' and let the
  // count query be the source of truth (it counts groups, not events).
  useEffect(() => {
    refreshUnread();
    const channel = supabase
      .channel(`notif-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            id?: number;
            type?: string;
            community_id?: number | null;
            is_read?: boolean;
          } | undefined;

          // Audible cue for every fresh notification of the right type —
          // independent of presence suppression so opt-in users still get
          // a ping even when the matching message scrolls by in front of
          // them. The hook is a no-op when sound is disabled or the tab
          // is in the background.
          if (payload.eventType === 'INSERT') {
            playSound(row?.type);
          }

          // Presence suppression: a chat reply in the tribune you are
          // currently viewing is something you can already see scroll by —
          // silently mark it read instead of lighting up the bell.
          if (
            row?.type === 'chat_reply' &&
            row.is_read === false &&
            row.id != null &&
            tribuneRef.current?.id != null &&
            row.community_id === tribuneRef.current.id
          ) {
            void markNotificationRead(supabase, row.id);
            return;
          }

          refreshUnread();
          if (open) loadList();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId, refreshUnread, loadList, open, playSound]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      await loadList();
    }
  }

  /**
   * Where a notification leads. Comment notifications deep-link to the
   * highlighted comment; a single new article opens the article; a coalesced
   * "N new articles" group opens the tribune's hub instead.
   */
  function targetUrl(n: NotificationItem): string | null {
    if (!n.communitySlug) return null;
    if (n.type === 'article_published') {
      return n.actorCount > 1 || !n.articleSlug
        ? `/tribunes/${n.communitySlug}`
        : `/tribunes/${n.communitySlug}/articles/${n.articleSlug}`;
    }
    // Comment / article-comment mention → deep-link to the comment.
    if (n.articleSlug) {
      return `/tribunes/${n.communitySlug}/articles/${n.articleSlug}${
        n.commentId ? `?commentId=${n.commentId}` : ''
      }`;
    }
    // chat_reply and chat mentions live in the tribune feed.
    return `/tribunes/${n.communitySlug}`;
  }

  async function handleItemClick(notif: NotificationItem) {
    // Optimistic: drop from the unread list immediately and mark as read.
    setItems((prev) => prev.filter((n) => n.id !== notif.id));
    setUnread((c) => Math.max(c - 1, 0));
    void markNotificationRead(supabase, notif.id);

    const url = targetUrl(notif);
    if (url) {
      setOpen(false);
      router.push(url);
    }
  }

  async function handleMarkAllRead() {
    setItems([]);
    setUnread(0);
    await markAllNotificationsRead(supabase, userId);
  }

  function labelFor(n: NotificationItem): string {
    const labelKey =
      n.type === 'comment_reply'
        ? 'replyLabel'
        : n.type === 'comment_reply_thread'
          ? 'replyThreadLabel'
          : n.type === 'article_published'
            ? 'articlePublishedLabel'
            : n.type === 'chat_reply'
              ? 'chatReplyLabel'
              : n.type === 'mention'
                ? 'mentionLabel'
                : 'commentOnArticleLabel';
    const community = n.communityName
      ? displayCommunityName({ name: n.communityName, name_en: n.communityNameEn }, locale)
      : '';
    return t(labelKey, {
      name: n.actorUsername ?? '—',
      count: n.actorCount,
      others: Math.max(n.actorCount - 1, 0),
      community,
    });
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={toggleOpen}
        aria-label={t('open')}
        aria-expanded={open}
        className="relative rounded-md p-2 text-gray-500 transition hover:bg-gray-100 dark:bg-[#1e1e1e] dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.8}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
          />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-red px-1 text-[10px] font-bold text-white ring-1 ring-white dark:ring-[#1e1e1e]">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 max-h-[28rem] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-[#1e1e1e]">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('title')}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                aria-pressed={soundEnabled}
                aria-label={soundEnabled ? t('soundOff') : t('soundOn')}
                title={soundEnabled ? t('soundOff') : t('soundOn')}
                className="rounded-md p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              >
                {soundEnabled
                  ? <Volume2 className="h-4 w-4 text-brand-blue" aria-hidden="true" />
                  : <VolumeX className="h-4 w-4" aria-hidden="true" />}
              </button>
              {unread > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-brand-blue hover:underline"
                >
                  {t('markAllRead')}
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-blue border-t-transparent" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">{t('empty')}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {items.map((n) => {
                const hideTitle = n.type === 'article_published' && n.actorCount > 1;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => handleItemClick(n)}
                      className={`flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-gray-50 dark:hover:bg-gray-800 ${
                        n.isRead ? '' : 'bg-brand-blue/5 dark:bg-brand-blue/10'
                      }`}
                    >
                      <Avatar url={n.actorAvatarUrl} name={n.actorUsername ?? '?'} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-gray-700 dark:text-gray-300">
                          {labelFor(n)}
                        </p>
                        {n.articleTitle && !hideTitle && (
                          <p className="mt-0.5 truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                            {n.articleTitle}
                          </p>
                        )}
                        <p className="mt-0.5 text-[10px] text-gray-400">
                          {formatTime(n.updatedAt)}
                        </p>
                      </div>
                      {!n.isRead && (
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-brand-blue" aria-hidden="true" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
