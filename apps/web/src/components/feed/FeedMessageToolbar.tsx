'use client';

import { memo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Heart, ThumbsDown, MessageCircle, Pencil, Trash2, Copy, Check } from 'lucide-react';
import { useMessageReaction } from '@/hooks/useMessageReaction';

interface FeedMessageToolbarProps {
  messageId: number;
  initialLikeCount: number;
  initialDislikeCount: number;
  userId: string | null;
  isOwn: boolean;
  canModerate: boolean;
  visible: boolean;
  copyText: string | null;
  onReply: () => void;
  onStartEdit?: () => void;
  onDelete?: () => void;
}

const BTN = 'rounded-md p-1.5 transition disabled:cursor-not-allowed disabled:opacity-40';

export const FeedMessageToolbar = memo(function FeedMessageToolbar({
  messageId,
  initialLikeCount,
  initialDislikeCount,
  userId,
  isOwn,
  canModerate,
  visible,
  copyText,
  onReply,
  onStartEdit,
  onDelete,
}: FeedMessageToolbarProps) {
  const t = useTranslations('tribune');
  const tc = useTranslations('common');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const { isLiked, isDisliked, toggleLike, toggleDislike, loading } =
    useMessageReaction(messageId, initialLikeCount, initialDislikeCount, userId);

  const showEdit = isOwn && !!onStartEdit;
  const showDelete = (isOwn || canModerate) && !!onDelete;
  const showReply = !isOwn;
  const showReactions = !isOwn;
  const showCopy = !!copyText && copyText.trim().length > 0;

  async function handleCopy() {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop — clipboard may be unavailable */
    }
  }

  return (
    <div
      className={`absolute -top-3 right-4 z-10 items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1 py-0.5 shadow-md dark:border-gray-700 dark:bg-[#272525] ${
        visible ? 'flex' : 'hidden'
      } md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100`}
    >
      {confirmDelete ? (
        <span className="flex items-center gap-2 px-2 py-0.5 text-xs">
          <button
            onClick={() => { onDelete?.(); setConfirmDelete(false); }}
            className="font-bold text-red-600 hover:text-red-700"
          >
            {tc('delete')}
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {tc('cancel')}
          </button>
        </span>
      ) : (
        <>
          {showReactions && (
            <>
              <button
                onClick={toggleLike}
                disabled={!userId || loading}
                className={`${BTN} ${
                  isLiked
                    ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-950'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-red-500 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
                title={isLiked ? 'Retirer le like' : "J'aime"}
              >
                <Heart className="h-4 w-4" fill={isLiked ? 'currentColor' : 'none'} strokeWidth={1.5} />
              </button>
              <button
                onClick={toggleDislike}
                disabled={!userId || loading}
                className={`${BTN} ${
                  isDisliked
                    ? 'text-brand-blue hover:bg-blue-50 dark:hover:bg-blue-950'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-brand-blue dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white'
                }`}
                title={isDisliked ? 'Retirer le dislike' : "Je n'aime pas"}
              >
                <ThumbsDown className="h-4 w-4" fill={isDisliked ? 'currentColor' : 'none'} strokeWidth={1.5} />
              </button>
            </>
          )}
          {showReply && (
            <button
              onClick={onReply}
              disabled={!userId}
              className={`${BTN} text-gray-500 hover:bg-gray-100 hover:text-brand-blue dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white`}
              title={t('reply')}
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
            </button>
          )}
          {showCopy && (showReactions || showReply) && (
            <span className="mx-0.5 h-4 w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
          )}
          {showCopy && (
            <button
              onClick={handleCopy}
              className={`${BTN} ${
                copied
                  ? 'text-green-500'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white'
              }`}
              title={tc('copy')}
            >
              {copied ? (
                <Check className="h-4 w-4" strokeWidth={2} />
              ) : (
                <Copy className="h-4 w-4" strokeWidth={1.5} />
              )}
            </button>
          )}
          {(showEdit || showDelete) && (showCopy || showReactions || showReply) && (
            <span className="mx-0.5 h-4 w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />
          )}
          {showEdit && (
            <button
              onClick={onStartEdit}
              className={`${BTN} text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200`}
              title={tc('edit')}
            >
              <Pencil className="h-4 w-4" strokeWidth={1.5} />
            </button>
          )}
          {showDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className={`${BTN} text-gray-500 hover:bg-red-50 hover:text-red-500 dark:text-gray-400 dark:hover:bg-red-950`}
              title={tc('delete')}
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.5} />
            </button>
          )}
        </>
      )}
    </div>
  );
});
