'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useSupabase } from '@/hooks/useSupabase';
import { Avatar } from '@/components/ui/Avatar';
import { MentionText } from '@/components/ui/MentionText';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatTime } from '@arena/shared';
import {
  fetchArticleComments,
  fetchCommentReplies,
  createArticleComment,
  removeArticleComment,
  type ArticleComment as ArticleCommentType,
} from '@/services/pressGalleryService';

interface ArticleCommentsProps {
  articleId: number;
  userId: string | null;
  /**
   * Whether the current viewer can moderate comments in this article's
   * community (owner, admin, moderator). Controls the visibility of the
   * « delete anyone's comment » button. When false, a user can still
   * delete their own comments.
   */
  canModerate?: boolean;
  /**
   * If a deep-link like `?commentId=123` drops a reader directly on a
   * specific comment, we scroll-flash it on mount.
   */
  focusCommentId?: number | null;
}

export function ArticleComments({
  articleId,
  userId,
  canModerate = false,
  focusCommentId = null,
}: ArticleCommentsProps) {
  const t = useTranslations('pressGallery');
  const supabase = useSupabase();

  const [topLevel, setTopLevel] = useState<ArticleCommentType[]>([]);
  const [replies, setReplies] = useState<Record<number, ArticleCommentType[]>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchArticleComments(supabase, articleId);
      setTopLevel(data);
    } catch {
      setError(t('errorLoadingComments'));
    } finally {
      setLoading(false);
    }
  }, [supabase, articleId, t]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // Auto-expand and scroll to a specific comment if deep-linked
  useEffect(() => {
    if (!focusCommentId) return;
    const id = `comment-${focusCommentId}`;
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-brand-blue');
        setTimeout(() => el.classList.remove('ring-2', 'ring-brand-blue'), 2500);
      }
    });
  }, [focusCommentId, topLevel, replies]);

  const loadReplies = useCallback(
    async (parentId: number) => {
      const data = await fetchCommentReplies(supabase, parentId);
      setReplies((prev) => ({ ...prev, [parentId]: data }));
      setExpanded((prev) => new Set(prev).add(parentId));
    },
    [supabase],
  );

  const submitComment = async (parentId: number | null, text: string) => {
    if (!userId) return { ok: false };
    const trimmed = text.trim();
    if (!trimmed) return { ok: false };

    const { error: apiError, id: newId } = await createArticleComment(
      supabase,
      articleId,
      userId,
      trimmed,
      parentId,
    );

    if (apiError || !newId) {
      setError(apiError?.message ?? t('errorSubmittingComment'));
      return { ok: false };
    }

    if (parentId === null) {
      await loadComments();
    } else {
      // Reload the parent's replies and bump the parent's reply_count locally.
      await loadReplies(parentId);
      setTopLevel((prev) =>
        prev.map((c) => (c.id === parentId ? { ...c, replyCount: c.replyCount + 1 } : c)),
      );
    }
    return { ok: true };
  };

  const handleTopLevelSubmit = async () => {
    if (!content.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const text = content;
    setContent('');
    const result = await submitComment(null, text);
    if (!result.ok) setContent(text);
    textareaRef.current?.focus();
    setSubmitting(false);
  };

  const handleDelete = async (commentId: number, parentId: number | null) => {
    if (!userId) return;
    setError(null);

    const { error: apiError } = await removeArticleComment(supabase, commentId, userId);
    if (apiError) {
      setError(apiError.message);
      return;
    }

    if (parentId === null) {
      setTopLevel((prev) => prev.filter((c) => c.id !== commentId));
    } else {
      setReplies((prev) => ({
        ...prev,
        [parentId]: (prev[parentId] ?? []).filter((c) => c.id !== commentId),
      }));
      setTopLevel((prev) =>
        prev.map((c) =>
          c.id === parentId ? { ...c, replyCount: Math.max(c.replyCount - 1, 0) } : c,
        ),
      );
    }
  };

  return (
    <div className="mt-8">
      <h3 className="mb-4 text-lg font-bold text-gray-900 dark:text-gray-100">
        {t('comments')}{' '}
        <span className="text-sm font-normal text-gray-500">
          ({t('commentCount', { count: topLevel.length })})
        </span>
      </h3>

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Top-level comment form */}
      {userId ? (
        <div className="mb-6">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('writeComment')}
            maxLength={2000}
            rows={3}
            className="w-full resize-none rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-blue focus:outline-none dark:border-gray-600 dark:bg-[#1e1e1e] dark:text-gray-100"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={handleTopLevelSubmit}
              disabled={!content.trim() || submitting}
              className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-blue-dark disabled:opacity-50"
            >
              {submitting ? t('submitting') : t('submitComment')}
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
          <Link href="/login" className="font-medium text-brand-blue hover:underline">
            {t('loginToComment')}
          </Link>
        </div>
      )}

      {loading && (
        <ul className="space-y-6" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2 pt-1">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && topLevel.length === 0 && (
        <p className="py-4 text-center text-sm text-gray-400">{t('noComments')}</p>
      )}

      {!loading && topLevel.length > 0 && (
        <ul className="space-y-6">
          {topLevel.map((c) => (
            <li key={c.id}>
              <CommentNode
                comment={c}
                userId={userId}
                canModerate={canModerate}
                onDelete={() => handleDelete(c.id, null)}
                onReply={async (text) => submitComment(c.id, text)}
                replyCount={c.replyCount}
                repliesLoaded={expanded.has(c.id)}
                replies={replies[c.id] ?? []}
                onToggleReplies={() => {
                  if (expanded.has(c.id)) {
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      next.delete(c.id);
                      return next;
                    });
                  } else {
                    loadReplies(c.id);
                  }
                }}
                onDeleteReply={(replyId) => handleDelete(replyId, c.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Single comment node ───────────────────────────────────────────────────

interface CommentNodeProps {
  comment: ArticleCommentType;
  userId: string | null;
  canModerate: boolean;
  onDelete: () => void;
  onReply: (text: string) => Promise<{ ok: boolean }>;
  replyCount: number;
  repliesLoaded: boolean;
  replies: ArticleCommentType[];
  onToggleReplies: () => void;
  onDeleteReply: (replyId: number) => void;
}

function CommentNode({
  comment,
  userId,
  canModerate,
  onDelete,
  onReply,
  replyCount,
  repliesLoaded,
  replies,
  onToggleReplies,
  onDeleteReply,
}: CommentNodeProps) {
  const t = useTranslations('pressGallery');
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  const canDelete = userId === comment.memberId || canModerate;

  async function handleReplySubmit() {
    if (!replyText.trim() || replying) return;
    setReplying(true);
    const result = await onReply(replyText);
    if (result.ok) {
      setReplyText('');
      setShowReplyBox(false);
    }
    setReplying(false);
  }

  return (
    <div id={`comment-${comment.id}`} className="scroll-mt-24 rounded-lg">
      <div className="flex gap-3">
        <Avatar url={comment.avatarUrl} name={comment.username} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {comment.username}
            </span>
            <span className="text-xs text-gray-400">{formatTime(comment.createdAt)}</span>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
            <MentionText text={comment.content} />
          </p>

          {/* Actions */}
          <div className="mt-1.5 flex items-center gap-3 text-xs">
            {userId && (
              <button
                onClick={() => setShowReplyBox((v) => !v)}
                className="font-medium text-gray-500 transition-colors hover:text-brand-blue"
              >
                {t('reply')}
              </button>
            )}
            {replyCount > 0 && (
              <button
                onClick={onToggleReplies}
                className="font-medium text-brand-blue hover:underline"
              >
                {repliesLoaded
                  ? t('hideReplies')
                  : t('showReplies', { count: replyCount })}
              </button>
            )}
          </div>

          {/* Reply textarea */}
          {showReplyBox && userId && (
            <div className="mt-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={t('writeReply')}
                maxLength={2000}
                rows={2}
                className="w-full resize-none rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-blue focus:outline-none dark:border-gray-600 dark:bg-[#1e1e1e] dark:text-gray-100"
              />
              <div className="mt-1 flex justify-end gap-2">
                <button
                  onClick={() => { setShowReplyBox(false); setReplyText(''); }}
                  className="rounded-md px-3 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleReplySubmit}
                  disabled={!replyText.trim() || replying}
                  className="rounded-md bg-brand-blue px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-brand-blue-dark disabled:opacity-50"
                >
                  {replying ? t('submitting') : t('submitReply')}
                </button>
              </div>
            </div>
          )}

          {/* Replies list, indented */}
          {repliesLoaded && replies.length > 0 && (
            <ul className="mt-3 space-y-3 border-l-2 border-gray-200 pl-4 dark:border-gray-700">
              {replies.map((r) => {
                const canDeleteReply = userId === r.memberId || canModerate;
                return (
                  <li
                    id={`comment-${r.id}`}
                    key={r.id}
                    className="flex gap-3 scroll-mt-24"
                  >
                    <Avatar url={r.avatarUrl} name={r.username} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {r.username}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatTime(r.createdAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                        <MentionText text={r.content} />
                      </p>
                    </div>
                    {canDeleteReply && (
                      <button
                        onClick={() => onDeleteReply(r.id)}
                        className="shrink-0 self-start p-1 text-gray-400 transition-colors hover:text-red-500"
                        title={canModerate && userId !== r.memberId ? t('moderateComment') : t('deleteComment')}
                        aria-label={t('deleteComment')}
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {canDelete && (
          <button
            onClick={onDelete}
            className="shrink-0 self-start p-1 text-gray-400 transition-colors hover:text-red-500"
            title={canModerate && userId !== comment.memberId ? t('moderateComment') : t('deleteComment')}
            aria-label={t('deleteComment')}
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}
