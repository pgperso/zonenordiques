'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { getMemberRank, formatTime, BOT_MEMBER_ID, type FeedMessage as FeedMessageType } from '@arena/shared';
import { Avatar } from '@/components/ui/Avatar';
import { FeedRichContent } from './FeedRichContent';
import { FeedImageGallery } from './FeedImageGallery';
import { FeedInput } from './FeedInput';
import { STAFF_RANK_MAP } from './FeedMessage';
import { useThread, type ThreadMessage } from '@/hooks/useThread';

interface RowData {
  memberId: string | null;
  content: string | null;
  imageUrls: string[];
  audioUrl: string | null;
  createdAt: string;
  member: { username: string; avatarUrl: string | null; messageCount: number } | null;
}

function ThreadMessageRow({
  data,
  staffRoles,
  isRoot,
}: {
  data: RowData;
  staffRoles: Record<string, string>;
  isRoot?: boolean;
}) {
  const staffRole = data.memberId ? staffRoles[data.memberId] : undefined;
  const rank =
    (staffRole ? STAFF_RANK_MAP[staffRole] : undefined) ?? getMemberRank(data.member?.messageCount ?? 0);
  const username = data.memberId === BOT_MEMBER_ID ? 'Bot' : (data.member?.username ?? 'Utilisateur supprimé');

  return (
    <div className={`flex gap-3 px-4 py-3 ${isRoot ? 'bg-gray-50 dark:bg-[#232323]' : ''}`}>
      <Avatar url={data.member?.avatarUrl} name={username} size="md" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{username}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${rank.bg}`}>{rank.label}</span>
          <span className="text-[11px] text-gray-400">{formatTime(data.createdAt)}</span>
        </div>
        {data.content && (
          <div className="mt-0.5 text-sm text-gray-900 dark:text-gray-100">
            <FeedRichContent content={data.content} />
          </div>
        )}
        {data.imageUrls.length > 0 && <FeedImageGallery imageUrls={data.imageUrls} />}
        {data.audioUrl && (
          <audio controls preload="metadata" src={data.audioUrl} className="mt-1 h-10 w-full max-w-xs" />
        )}
      </div>
    </div>
  );
}

interface ThreadPanelProps {
  root: FeedMessageType;
  userId: string | null;
  communityId: number;
  staffRoles: Record<string, string>;
  onSendReply: (content: string, imageUrls?: string[], audioUrl?: string | null, audioDuration?: number | null) => Promise<void>;
  onClose: () => void;
}

export function ThreadPanel({ root, userId, communityId, staffRoles, onSendReply, onClose }: ThreadPanelProps) {
  const { replies, loading } = useThread(root.id);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rootRow: RowData = {
    memberId: root.memberId,
    content: root.content,
    imageUrls: root.imageUrls,
    audioUrl: root.audioUrl,
    createdAt: root.feedTimestamp,
    member: root.member
      ? { username: root.member.username, avatarUrl: root.member.avatarUrl, messageCount: root.member.messageCount }
      : null,
  };

  const replyRow = (r: ThreadMessage): RowData => ({
    memberId: r.memberId,
    content: r.content,
    imageUrls: r.imageUrls,
    audioUrl: r.audioUrl,
    createdAt: r.createdAt,
    member: r.member,
  });

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      {/* Panel */}
      <div className="relative flex h-full w-full flex-col bg-white shadow-xl dark:bg-[#1e1e1e] sm:max-w-md">
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

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {/* Root message */}
          <ThreadMessageRow data={rootRow} staffRoles={staffRoles} isRoot />

          {/* Replies */}
          <div className="border-t border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-400 dark:border-gray-700">
            {replies.length > 0
              ? `${replies.length} réponse${replies.length > 1 ? 's' : ''}`
              : loading
                ? 'Chargement…'
                : 'Aucune réponse pour l’instant — sois le premier à répondre.'}
          </div>
          {replies.map((r) => (
            <ThreadMessageRow key={r.id} data={replyRow(r)} staffRoles={staffRoles} />
          ))}
        </div>

        {/* Composer — always replies to the root (keeps the thread 1-level). */}
        {userId ? (
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
            Connecte-toi pour répondre.
          </div>
        )}
      </div>
    </div>
  );
}
