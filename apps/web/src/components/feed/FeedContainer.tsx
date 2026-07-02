'use client';

import { useRef, useState, useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { isGroupedMessage } from '@/lib/feedUtils';
import { useFeed } from '@/hooks/useFeed';
import type { FeedItem as FeedItemType, FeedMessage as FeedMessageType } from '@arena/shared';
import { usePresence } from '@/hooks/usePresence';
import { useAuth } from '@/hooks/useAuth';
import { BatchLikeProvider } from '@/hooks/useBatchLikeStatus';
import { FeedItem } from './FeedItem';
import { FeedInput } from './FeedInput';
import { FeedSkeleton } from './FeedSkeleton';
import { FeedReplyBar } from './FeedReplyBar';
import dynamic from 'next/dynamic';
import { OnlineMembers } from '@/components/chat/OnlineMembers';
import { Link } from '@/i18n/navigation';
import { useTribune } from '@/contexts/TribuneContext';

const ArticleEditor = dynamic(() => import('@/components/article/ArticleEditor').then((m) => m.ArticleEditor), { ssr: false });
const ArticleList = dynamic(() => import('@/components/article/ArticleList').then((m) => m.ArticleList), { ssr: false });
const PodcastEditor = dynamic(() => import('@/components/podcast/PodcastEditor').then((m) => m.PodcastEditor), { ssr: false });
const ModerationPanel = dynamic(() => import('@/components/moderation/ModerationPanel').then((m) => m.ModerationPanel), { ssr: false });

type DisplayItem = { kind: 'feed'; item: FeedItemType; index: number };

interface FeedContainerProps {
  communityId: number;
  communityName: string;
  communitySlug: string;
  isMember: boolean;
  isMuted: boolean;
  articleNotifMuted: boolean;
  canModerate: boolean;
  canCreateContent: boolean;
  staffRoles: Record<string, string>;
  onLeave?: () => void;
}

export function FeedContainer({
  communityId,
  communityName,
  communitySlug,
  isMember,
  isMuted,
  articleNotifMuted,
  canModerate,
  canCreateContent,
  staffRoles,
  onLeave,
}: FeedContainerProps) {
  const router = useRouter();
  const t = useTranslations('tribune');
  const tc = useTranslations('common');
  const { user, username, avatarUrl } = useAuth();
  const {
    items,
    loading,
    hasMore,
    firstItemIndex,
    sendMessage,
    sendReply,
    editMessage,
    loadMore,
    deleteMessage,
    getMessageById,
  } = useFeed(communityId, user?.id ?? null);
  const { onlineMembers } = usePresence(communityId, user?.id ?? null, username, avatarUrl);

  // Build a status map for quick lookup in messages
  const onlineStatuses = useMemo(() => {
    const map: Record<string, 'online' | 'idle'> = {};
    for (const m of onlineMembers) {
      map[m.memberId] = m.status;
    }
    return map;
  }, [onlineMembers]);

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const { membersOpen: showMembers, setMembersOpen: setShowMembers } = useTribune();
  const [showArticleEditor, setShowArticleEditor] = useState(false);
  const [showModeration, setShowModeration] = useState(false);
  const [showArticleList, setShowArticleList] = useState(false);
  const [showPodcastEditor, setShowPodcastEditor] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Reply state
  const [replyTarget, setReplyTarget] = useState<FeedMessageType | null>(null);

  // Edit state — only one message at a time (Discord behavior)
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);

  // Mutable staff roles (updated when owner changes a role via popover)
  const [liveStaffRoles, setLiveStaffRoles] = useState(staffRoles);
  const handleRoleChanged = useCallback((memberId: string, newRole: string | null) => {
    setLiveStaffRoles((prev) => {
      const next = { ...prev };
      if (newRole) {
        next[memberId] = newRole;
      } else {
        delete next[memberId];
      }
      return next;
    });
  }, []);

  // No in-feed ads inside the chat: Google AdSense policy frowns on ads
  // placed next to real-time, unmoderated user-generated content. Sidebar
  // and mobile anchor ads remain on the page (they're outside the feed).
  const displayItems: DisplayItem[] = useMemo(() => {
    return items.map((item, i) => ({ kind: 'feed' as const, item, index: i }));
  }, [items]);

  // Find active live podcast for sticky player
  const activeLive = useMemo(() => {
    return items.find(
      (item) => item.feedType === 'podcast' && item.isLive && item.youtubeVideoId,
    ) as (FeedItemType & { feedType: 'podcast'; youtubeVideoId: string }) | undefined;
  }, [items]);

  function getInputPlaceholder(): string {
    if (!user) return `${t('loginToChat')} ${t('toParticipate')}`;
    if (!isMember) return t('joinToChat');
    if (isMuted) return t('muted');
    if (replyTarget) return t('replyTo', { username: replyTarget.member?.username ?? t('deletedUser') });
    return t('writeMessage');
  }

  const handleSend = useCallback(
    async (content: string, imageUrls?: string[]) => {
      if (replyTarget) {
        await sendReply(replyTarget.id, content, imageUrls);
        setReplyTarget(null);
      } else {
        await sendMessage(content, imageUrls);
      }
    },
    [replyTarget, sendReply, sendMessage],
  );

  const handleReply = useCallback((message: FeedMessageType) => {
    setReplyTarget(message);
  }, []);

  const scrollToMessage = useCallback(
    (messageId: number) => {
      const index = displayItems.findIndex(
        (d) => d.kind === 'feed' && d.item.feedType === 'message' && d.item.id === messageId,
      );
      if (index === -1) return;
      virtuosoRef.current?.scrollToIndex({ index, align: 'center', behavior: 'smooth' });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 1500);
    },
    [displayItems],
  );

  const handleStartReached = useCallback(() => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    loadMore().then(() => setLoadingMore(false));
  }, [hasMore, loadingMore, loadMore]);

  const inputDisabled = !user || !isMember || isMuted;

  // Collect IDs for batch like queries (3 queries instead of 50+)
  const { messageIds, articleIds, podcastIds } = useMemo(() => {
    const mIds: number[] = [];
    const aIds: number[] = [];
    const pIds: number[] = [];
    for (const item of items) {
      if (item.feedType === 'message') mIds.push(item.id);
      else if (item.feedType === 'article') aIds.push(item.id);
      else if (item.feedType === 'podcast') pIds.push(item.id);
    }
    return { messageIds: mIds, articleIds: aIds, podcastIds: pIds };
  }, [items]);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Feed area */}
      <div className="relative flex flex-1 flex-col overflow-hidden dark:border-x dark:border-gray-700">
        <>
        {/* Live banner — small notification, click to scroll to the live card */}
        {activeLive && (
          <button
            onClick={() => {
              const idx = displayItems.findIndex(
                (d) => d.kind === 'feed' && d.item.feedType === 'podcast' && d.item.id === activeLive.id,
              );
              if (idx !== -1) virtuosoRef.current?.scrollToIndex({ index: idx, align: 'start', behavior: 'smooth' });
            }}
            className="flex w-full shrink-0 items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2 text-left text-sm transition hover:bg-red-100"
          >
            <span className="flex h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span className="font-semibold text-red-700">{t('liveNow')}</span>
            <span className="truncate text-red-600">{activeLive.title}</span>
          </button>
        )}

        {/* Feed items — react-virtuoso handles measurement, scroll, and positioning */}
        <div className="min-h-0 flex-1 overflow-x-hidden">
          {loading ? (
            <FeedSkeleton />
          ) : (
            <BatchLikeProvider
              userId={user?.id ?? null}
              messageIds={messageIds}
              articleIds={articleIds}
              podcastIds={podcastIds}
            >
              {displayItems.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-gray-400">
                  <svg className="mb-3 h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                  <p className="text-sm">{t('noContent')}</p>
                </div>
              ) : (
                <Virtuoso
                  ref={virtuosoRef}
                  data={displayItems}
                  firstItemIndex={firstItemIndex}
                  initialTopMostItemIndex={displayItems.length - 1}
                  // Anchor to the bottom (chat layout): late measurements
                  // push the OLDER items up instead of bouncing the latest
                  // message — biggest cure for first-scroll flicker.
                  alignToBottom
                  // Pre-render a screenful at mount so real heights are
                  // measured BEFORE the first scroll. Capped at the actual
                  // data length so Virtuoso is never asked for rows that
                  // do not exist.
                  initialItemCount={Math.min(20, displayItems.length)}
                  // Only auto-follow new messages when the user is already at
                  // the bottom — otherwise a fresh message would fight their
                  // scroll and flicker visibly on mobile inertial scroll.
                  followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
                  atBottomStateChange={setAtBottom}
                  atBottomThreshold={120}
                  // Generous pixel-based viewport buffer for smooth iOS
                  // inertial scroll.
                  increaseViewportBy={{ top: 600, bottom: 600 }}
                  // Stable identity per row so likes / edits / realtime
                  // updates re-use the same DOM node. Defensive: a malformed
                  // row falls back to a positional key.
                  computeItemKey={(idx, di) => {
                    const it = di?.item;
                    if (!it || it.feedType == null || it.id == null) return `idx-${idx}`;
                    return `${it.feedType}-${it.id}`;
                  }}
                  startReached={handleStartReached}
                  components={{
                    Header: loadingMore ? () => (
                      <div className="flex justify-center py-3">
                        <svg
                          className="h-5 w-5 animate-spin text-gray-400"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      </div>
                    ) : undefined,
                  }}
                  itemContent={(virtuosoIndex, displayItem) => {
                    // Virtuoso can briefly call itemContent with undefined
                    // (placeholder slots, transitions between data arrays).
                    // Render nothing instead of letting the destructure
                    // crash the whole route.
                    if (!displayItem?.item) return null;
                    const { item, index } = displayItem;
                    const isGrouped = index > 0 && isGroupedMessage(item, items[index - 1]);

                    return (
                      <FeedItem
                        item={item}
                        userId={user?.id ?? null}
                        canModerate={canModerate}
                        communityId={communityId}
                        staffRoles={liveStaffRoles}
                        communitySlug={communitySlug}
                        isHighlighted={item.feedType === 'message' && item.id === highlightedMessageId}
                        isGrouped={isGrouped}
                        onDeleteMessage={deleteMessage}
                        onEditMessage={editMessage}
                        editingMessageId={editingMessageId}
                        onStartEdit={setEditingMessageId}
                        onReply={handleReply}
                        onScrollToMessage={scrollToMessage}
                        getMessageById={getMessageById}
                        onRoleChanged={handleRoleChanged}
                        onlineStatuses={onlineStatuses}
                      />
                    );
                  }}
                />
              )}
            </BatchLikeProvider>
          )}
        </div>

        {/* Jump to bottom — Discord-style */}
        {!atBottom && displayItems.length > 0 && (
          <div className="absolute bottom-20 left-1/2 z-10 -translate-x-1/2">
            <button
              onClick={() => {
                virtuosoRef.current?.scrollToIndex({ index: displayItems.length - 1, behavior: 'smooth' });
              }}
              className="flex items-center gap-1.5 rounded-full bg-brand-blue px-4 py-2 text-xs font-medium text-white shadow-lg transition hover:bg-brand-blue-dark"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
              </svg>
              {t('recentMessages')}
            </button>
          </div>
        )}

        {/* Reply bar */}
        {replyTarget && (
          <FeedReplyBar
            username={replyTarget.member?.username ?? t('deletedUser')}
            preview={replyTarget.content}
            onCancel={() => setReplyTarget(null)}
          />
        )}

        {/* Input area */}
        {user ? (
          <FeedInput
            onSend={handleSend}
            disabled={inputDisabled}
            placeholder={getInputPlaceholder()}
            communityId={communityId}
            userId={user.id}
            autoFocus={!!replyTarget}
          />
        ) : (
          <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e1e1e] px-4 py-3 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              <Link href="/login" className="font-medium text-brand-blue hover:underline">
                {t('loginToChat')}
              </Link>{' '}
              {t('orRegister')}{' '}
              <Link href="/register" className="font-medium text-brand-blue hover:underline">
                {t('registerToChat')}
              </Link>{' '}
              {t('toParticipate')}
            </p>
          </div>
        )}
        </>
      </div>

      {/* Online members sidebar — permanent on lg+, slide-from-right drawer
          on mobile/tablet with a dark backdrop */}
      {showMembers && (
        <div
          onClick={() => setShowMembers(false)}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] transform border-l border-gray-200 bg-white shadow-xl transition-transform duration-200 dark:border-gray-700 dark:bg-[#1e1e1e] lg:static lg:w-60 lg:translate-x-0 lg:border-r lg:shadow-none ${
          showMembers ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
        aria-label={t('membersOnline')}
      >
        {/* Close button — mobile only */}
        <button
          onClick={() => setShowMembers(false)}
          aria-label={tc('close')}
          className="absolute right-2 top-2 z-10 rounded-full p-1.5 text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 lg:hidden"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
        <OnlineMembers
          members={onlineMembers}
          communityName={communityName}
          communityId={communityId}
          userId={user?.id ?? null}
          articleNotifMuted={articleNotifMuted}
          canModerate={canModerate}
          canCreateContent={canCreateContent}
          onModerate={canModerate && user ? () => { setShowModeration(true); setShowMembers(false); } : undefined}
          onArticle={canCreateContent && user ? () => { setShowArticleEditor(true); setShowMembers(false); } : undefined}
          onMyArticles={canCreateContent && user ? () => { setShowArticleList(true); setShowMembers(false); } : undefined}
          onPodcast={canCreateContent && user ? () => { setShowPodcastEditor(true); setShowMembers(false); } : undefined}
          onLeave={user && onLeave ? () => { onLeave(); setShowMembers(false); } : undefined}
        />
      </aside>

      {/* Article editor overlay */}
      {showArticleEditor && user && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white dark:bg-[#1e1e1e]">
          <div className="p-4">
            <ArticleEditor
              communityId={communityId}
              communitySlug={communitySlug}
              userId={user.id}
              onPublished={(slug, targetSlug) => {
                setShowArticleEditor(false);
                router.push(`/tribunes/${targetSlug}/articles/${slug}`);
              }}
              onCancel={() => setShowArticleEditor(false)}
            />
          </div>
        </div>
      )}

      {/* Podcast editor overlay */}
      {showPodcastEditor && user && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white dark:bg-[#1e1e1e]">
          <div className="p-4">
            <PodcastEditor
              communityId={communityId}
              userId={user.id}
              onSaved={() => setShowPodcastEditor(false)}
              onCancel={() => setShowPodcastEditor(false)}
            />
          </div>
        </div>
      )}

      {/* Article list overlay */}
      {showArticleList && user && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white dark:bg-[#1e1e1e]">
          <div className="p-4">
            <ArticleList
              communityId={communityId}
              communitySlug={communitySlug}
              userId={user.id}
              onClose={() => setShowArticleList(false)}
            />
          </div>
        </div>
      )}

      {/* Moderation panel */}
      {showModeration && (
        <ModerationPanel
          communityId={communityId}
          onClose={() => setShowModeration(false)}
        />
      )}
    </div>
  );
}

