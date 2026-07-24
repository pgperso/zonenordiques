'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import type { FeedMessage as FeedMessageType } from '@arena/shared';
import { BatchLikeProvider } from '@/hooks/useBatchLikeStatus';
import { FeedMessage } from './FeedMessage';
import { FeedInput } from './FeedInput';
import { useThread } from '@/hooks/useThread';

interface ThreadPanelProps {
  root: FeedMessageType;
  userId: string | null;
  communityId: number;
  canModerate: boolean;
  staffRoles: Record<string, string>;
  editingMessageId: number | null;
  onStartEdit: (id: number | null) => void;
  onDeleteMessage: (id: number) => void;
  onEditMessage: (id: number, content: string) => void;
  onRoleChanged?: (memberId: string, newRole: string | null) => void;
  onlineStatuses?: Record<string, 'online' | 'idle'>;
  /** Same gate as the main chat input: logged in + member + not muted. */
  canReply: boolean;
  disabledReason: string;
  onSendReply: (content: string, imageUrls?: string[], audioUrl?: string | null, audioDuration?: number | null) => Promise<void>;
  onClose: () => void;
}

const noop = () => {};
// Replies reply to the root via the composer, so no per-message reply target;
// and no reply-context quote inside the thread (would just repeat the root).
const noParentLookup = () => undefined;

// Group consecutive replies from the same author (within 5 min) so the
// avatar/name/badge don't repeat. isGroupedMessage can't be reused: it bails
// on any message with a parentId, which every reply has.
const GROUP_WINDOW_MS = 5 * 60 * 1000;
function sameAuthorGroup(cur: FeedMessageType, prev: FeedMessageType): boolean {
  if (cur.isRemoved || prev.isRemoved || cur.memberId !== prev.memberId) return false;
  return new Date(cur.feedTimestamp).getTime() - new Date(prev.feedTimestamp).getTime() < GROUP_WINDOW_MS;
}

export function ThreadPanel({
  root,
  userId,
  communityId,
  canModerate,
  staffRoles,
  editingMessageId,
  onStartEdit,
  onDeleteMessage,
  onEditMessage,
  onRoleChanged,
  onlineStatuses,
  canReply,
  disabledReason,
  onSendReply,
  onClose,
}: ThreadPanelProps) {
  const { replies, loading } = useThread(root.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const messageIds = [root.id, ...replies.map((r) => r.id)];

  const renderMessage = (msg: FeedMessageType, isGrouped: boolean) => (
    <FeedMessage
      key={msg.id}
      message={msg}
      isOwn={msg.memberId === userId}
      canModerate={canModerate}
      userId={userId}
      communityId={communityId}
      isGrouped={isGrouped}
      editing={editingMessageId === msg.id}
      staffRole={staffRoles[msg.memberId ?? '']}
      onDelete={onDeleteMessage}
      onEdit={onEditMessage}
      onStartEdit={() => onStartEdit(msg.id)}
      onCancelEdit={() => onStartEdit(null)}
      onReply={noop}
      getMessageById={noParentLookup}
      onRoleChanged={onRoleChanged}
      presenceStatus={onlineStatuses?.[msg.memberId ?? '']}
    />
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#1e1e1e]">
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Fil de discussion</h2>
          <button
            onClick={onClose}
            aria-label="Fermer le fil"
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-2">
          <BatchLikeProvider userId={userId} messageIds={messageIds} articleIds={[]} podcastIds={[]}>
            {renderMessage(root, false)}

            <div className="border-y border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-400 dark:border-gray-700">
              {replies.length > 0
                ? `${replies.length} réponse${replies.length > 1 ? 's' : ''}`
                : loading
                  ? 'Chargement…'
                  : 'Aucune réponse — sois le premier à répondre.'}
            </div>

            {replies.map((r, i) => renderMessage(r, i > 0 && sameAuthorGroup(r, replies[i - 1])))}
          </BatchLikeProvider>
        </div>

        {canReply && userId ? (
          <FeedInput
            onSend={onSendReply}
            disabled={false}
            placeholder="Répondre au fil…"
            communityId={communityId}
            userId={userId}
            canModerate={false}
            autoFocus
          />
        ) : (
          <div className="border-t border-gray-200 px-4 py-3 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
            {disabledReason}
          </div>
        )}
      </div>
    </div>
  );
}
