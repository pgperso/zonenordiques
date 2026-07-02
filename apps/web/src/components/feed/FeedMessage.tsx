'use client';

import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { formatTime, getMemberRank, BOT_MEMBER_ID } from '@arena/shared';
import type { FeedMessage as FeedMessageType } from '@arena/shared';
import { FeedMessageToolbar } from './FeedMessageToolbar';
import { FeedMessageStats } from './FeedMessageStats';
import { FeedImageGallery } from './FeedImageGallery';
import { FeedRichContent } from './FeedRichContent';
import { FeedReplyContext } from './FeedReplyContext';
import { FeedLinkPreview } from './FeedLinkPreview';
import { Avatar } from '@/components/ui/Avatar';
import { UserPopover } from '@/components/ui/UserPopover';
import { BRAND } from '@/lib/brand';
import { StatusDot } from '@/components/ui/StatusDot';
import { useTribune } from '@/contexts/TribuneContext';

const STAFF_RANK_MAP: Record<string, { label: string; color: string; bg: string }> = {
  owner: { label: 'Propriétaire', color: 'text-brand-blue', bg: 'bg-brand-blue text-white' },
  admin: { label: 'Arbitre', color: 'text-red-600', bg: 'bg-red-600 text-white' },
  moderator: { label: 'Arbitre', color: 'text-red-600', bg: 'bg-red-600 text-white' },
  creator: { label: 'Journaliste', color: 'text-purple-600', bg: 'bg-purple-100 text-purple-700' },
};

interface FeedMessageProps {
  message: FeedMessageType;
  isOwn: boolean;
  canModerate: boolean;
  userId: string | null;
  communityId: number;
  isHighlighted?: boolean;
  isGrouped?: boolean;
  editing?: boolean;
  staffRole?: string;
  onDelete: (messageId: number) => void;
  onEdit: (messageId: number, content: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onReply: (message: FeedMessageType) => void;
  onScrollToMessage?: (messageId: number) => void;
  getMessageById: (id: number) => FeedMessageType | undefined;
  onRoleChanged?: (memberId: string, newRole: string | null) => void;
  presenceStatus?: 'online' | 'idle';
}

export const FeedMessage = memo(function FeedMessage({
  message,
  isOwn,
  canModerate,
  userId,
  communityId,
  isHighlighted,
  isGrouped,
  editing,
  staffRole,
  onDelete,
  onEdit,
  onStartEdit,
  onCancelEdit,
  onReply,
  onScrollToMessage,
  getMessageById,
  onRoleChanged,
  presenceStatus,
}: FeedMessageProps) {
  const t = useTranslations('tribune');
  const username = message.member?.username ?? t('deletedUser');
  const rank: { label: string; color: string; bg: string } =
    (staffRole ? STAFF_RANK_MAP[staffRole] : undefined) ?? getMemberRank(message.member?.messageCount ?? 0);
  const time = formatTime(message.createdAt);
  const [editContent, setEditContent] = useState(message.content ?? '');
  const editRef = useRef<HTMLTextAreaElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressOrigin = useRef<{ x: number; y: number } | null>(null);
  const touchInteractionRef = useRef(false);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);
  const { openToolbarMessageId, setOpenToolbarMessageId } = useTribune();
  const mobileToolbar = openToolbarMessageId === message.id;

  function startLongPress(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, textarea, input')) return;
    cancelLongPress();
    touchInteractionRef.current = true;
    longPressOrigin.current = { x: e.clientX, y: e.clientY };
    longPressTimer.current = window.setTimeout(() => {
      setOpenToolbarMessageId(message.id);
      longPressTimer.current = null;
    }, 450);
  }

  // Only cancel the long-press if the finger actually moved — Android fires
  // spurious pointermove events with near-zero displacement that otherwise
  // kill the timer immediately.
  function maybeCancelOnMove(e: React.PointerEvent) {
    if (longPressTimer.current === null || longPressOrigin.current === null) return;
    const dx = e.clientX - longPressOrigin.current.x;
    const dy = e.clientY - longPressOrigin.current.y;
    if (dx * dx + dy * dy > 64) {
      cancelLongPress();
    }
  }

  function cancelLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      // Release the contextmenu guard only if the long-press was aborted
      // before firing; if the timer already fired, let the guard survive
      // long enough to suppress the native menu that will follow.
      touchInteractionRef.current = false;
    }
    longPressOrigin.current = null;
  }

  useEffect(() => {
    if (editing && editRef.current) {
      setEditContent(message.content ?? '');
      editRef.current.focus();
      editRef.current.selectionStart = editRef.current.value.length;
    }
  }, [editing, message.content]);

  useEffect(() => {
    if (!mobileToolbar) return;
    function handlePointer(e: PointerEvent) {
      if (messageRef.current && !messageRef.current.contains(e.target as Node)) {
        setOpenToolbarMessageId(null);
      }
    }
    document.addEventListener('pointerdown', handlePointer);
    return () => document.removeEventListener('pointerdown', handlePointer);
  }, [mobileToolbar, setOpenToolbarMessageId]);

  const handleUsernameClick = useCallback((e: React.MouseEvent) => {
    if (!message.memberId || isOwn) return;
    setPopoverRect(e.currentTarget.getBoundingClientRect());
  }, [message.memberId, isOwn]);

  if (message.isRemoved) {
    return (
      <div className="px-4 py-0.5">
        <p className="text-sm italic text-gray-400">[{t('deletedMessage')}]</p>
      </div>
    );
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const trimmed = editContent.trim();
      if (trimmed && trimmed !== message.content) {
        onEdit(message.id, trimmed);
      }
      onCancelEdit();
    }
    if (e.key === 'Escape') {
      onCancelEdit();
    }
  }

  const parentMessage = message.parentId ? getMessageById(message.parentId) : undefined;
  const hasReplyContext = !!(message.parentId && parentMessage);

  const toolbar = !editing ? (
    <FeedMessageToolbar
      messageId={message.id}
      initialLikeCount={message.likeCount}
      initialDislikeCount={message.dislikeCount}
      userId={userId}
      isOwn={isOwn}
      canModerate={canModerate}
      visible={mobileToolbar}
      copyText={message.content}
      onReply={() => onReply(message)}
      onStartEdit={isOwn ? onStartEdit : undefined}
      onDelete={(canModerate || isOwn) ? () => onDelete(message.id) : undefined}
    />
  ) : null;

  const contentBlock = editing ? (
    <div className="mt-0.5">
      <textarea
        ref={editRef}
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        onKeyDown={handleEditKeyDown}
        rows={1}
        className="w-full resize-none rounded-md border border-brand-blue bg-gray-50 dark:bg-[#1e1e1e] px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-brand-blue"
        style={{ height: 'auto', minHeight: '2rem' }}
        onInput={(e) => {
          const t = e.currentTarget;
          t.style.height = 'auto';
          t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
        }}
      />
      <p className="mt-0.5 text-[10px] text-gray-400">
        {t('editSave')}
      </p>
    </div>
  ) : (
    <>
      {message.content && <FeedRichContent content={message.content} />}
    </>
  );

  const usernameClickable = !isOwn && !!message.memberId && canModerate;

  const popover = popoverRect && message.memberId ? (
    <UserPopover
      memberId={message.memberId}
      username={username}
      communityId={communityId}
      currentRole={staffRole}
      canManageRoles={canModerate}
      anchorRect={popoverRect}
      onClose={() => setPopoverRect(null)}
      onRoleChanged={onRoleChanged}
    />
  ) : null;

  // Grouped message: compact, with subtle username
  if (isGrouped && !hasReplyContext) {
    return (
      <div
        ref={messageRef}
        className={`group relative py-1.5 pl-[52px] pr-3 transition-colors sm:pl-[60px] sm:pr-4 select-none [-webkit-touch-callout:none] md:select-text ${isHighlighted ? 'message-highlight' : 'hover:bg-gray-50 dark:hover:bg-[#272525] dark:bg-[#1e1e1e]'}`}
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerMove={maybeCancelOnMove}
        onPointerCancel={cancelLongPress}
        onContextMenu={(e) => {
          if (touchInteractionRef.current || mobileToolbar) {
            e.preventDefault();
            touchInteractionRef.current = false;
          }
        }}
      >
        <span className="absolute left-2 top-2 text-[10px] text-gray-400 opacity-0 group-hover:opacity-100">
          {time}
        </span>
        <span
          className={`text-[10px] font-medium text-gray-400 ${usernameClickable ? 'cursor-pointer hover:text-gray-600 dark:hover:text-gray-300 dark:text-gray-400 hover:underline' : ''}`}
          onClick={usernameClickable ? handleUsernameClick : undefined}
        >
          {username}
        </span>

        {toolbar}
        {contentBlock}
        {!editing && message.linkPreviews && message.linkPreviews.length > 0 && (
          <FeedLinkPreview previews={message.linkPreviews} />
        )}
        {!editing && message.imageUrls.length > 0 && (
          <FeedImageGallery imageUrls={message.imageUrls} />
        )}

        {!editing && (
          <FeedMessageStats
            likeCount={message.likeCount}
            dislikeCount={message.dislikeCount}
            replyCount={message.replyCount}
          />
        )}
        {popover}
      </div>
    );
  }

  // Full message
  return (
    <div
      ref={messageRef}
      className={`group relative px-4 pt-3 pb-1 transition-colors select-none [-webkit-touch-callout:none] md:select-text ${isHighlighted ? 'message-highlight' : 'hover:bg-gray-50 dark:hover:bg-[#272525] dark:bg-[#1e1e1e]'}`}
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerMove={maybeCancelOnMove}
      onPointerCancel={cancelLongPress}
      onContextMenu={(e) => { if (mobileToolbar) e.preventDefault(); }}
    >
      {hasReplyContext && (
        <div className="mb-0.5 flex items-end pl-4">
          <div className="reply-connector relative -top-0.5" />
          <div className="ml-8 min-w-0 overflow-hidden">
            <FeedReplyContext
              parentUsername={parentMessage.member?.username ?? t('deletedUser')}
              parentAvatarUrl={parentMessage.member?.avatarUrl}
              parentContent={parentMessage.content}
              onClick={onScrollToMessage ? () => onScrollToMessage(parentMessage.id) : undefined}
            />
          </div>
        </div>
      )}

      {toolbar}

      <div className="flex gap-3">
        <div className="relative mt-0.5 h-8 w-8 flex-shrink-0">
          {message.memberId === BOT_MEMBER_ID ? (
            <img
              src={BRAND.logo}
              alt={username}
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg object-contain"
            />
          ) : (
            <>
              <Avatar url={message.member?.avatarUrl} name={username} size="md" />
              {presenceStatus && <StatusDot status={presenceStatus} size="md" />}
            </>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-semibold ${isOwn ? 'text-brand-blue' : 'text-gray-900 dark:text-gray-100'} ${usernameClickable ? 'cursor-pointer hover:underline' : ''}`}
              onClick={usernameClickable ? handleUsernameClick : undefined}
            >
              {username}
            </span>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${rank.bg}`}>{rank.label}</span>
            <span className="text-xs text-gray-400">{time}</span>
          </div>

          {contentBlock}
          {!editing && message.linkPreviews && message.linkPreviews.length > 0 && (
            <FeedLinkPreview previews={message.linkPreviews} />
          )}
          {!editing && message.imageUrls.length > 0 && (
            <FeedImageGallery imageUrls={message.imageUrls} />
          )}

          {!editing && (
            <FeedMessageStats
              likeCount={message.likeCount}
              dislikeCount={message.dislikeCount}
              replyCount={message.replyCount}
            />
          )}
        </div>
      </div>
      {popover}
    </div>
  );
});
