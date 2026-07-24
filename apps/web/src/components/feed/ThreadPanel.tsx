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

function displayName(data: RowData) {
  return data.memberId === BOT_MEMBER_ID ? 'Bot' : (data.member?.username ?? 'Utilisateur supprimé');
}

function rankFor(data: RowData, staffRoles: Record<string, string>) {
  const staffRole = data.memberId ? staffRoles[data.memberId] : undefined;
  return (staffRole ? STAFF_RANK_MAP[staffRole] : undefined) ?? getMemberRank(data.member?.messageCount ?? 0);
}

function MessageBody({ data }: { data: RowData }) {
  return (
    <>
      {data.content && (
        <div className="text-sm leading-snug">
          <FeedRichContent content={data.content} />
        </div>
      )}
      {data.imageUrls.length > 0 && <FeedImageGallery imageUrls={data.imageUrls} />}
      {data.audioUrl && (
        <audio controls preload="metadata" src={data.audioUrl} className="mt-1 h-10 w-full max-w-[220px]" />
      )}
    </>
  );
}

/** The message the conversation is about — shown once at the top. */
function RootMessage({ data, staffRoles }: { data: RowData; staffRoles: Record<string, string> }) {
  const name = displayName(data);
  const rank = rankFor(data, staffRoles);
  return (
    <div className="flex gap-3 px-4 py-3">
      <Avatar url={data.member?.avatarUrl} name={name} size="md" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{name}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${rank.bg}`}>{rank.label}</span>
          <span className="text-[11px] text-gray-400">{formatTime(data.createdAt)}</span>
        </div>
        <div className="mt-0.5 text-gray-900 dark:text-gray-100">
          <MessageBody data={data} />
        </div>
      </div>
    </div>
  );
}

/**
 * A reply, as a filled bubble. Avatar + name + badge show only on the first
 * message of a run from the same author (grouping) so nothing repeats.
 */
function ReplyBubble({
  data,
  staffRoles,
  showHeader,
}: {
  data: RowData;
  staffRoles: Record<string, string>;
  showHeader: boolean;
}) {
  const name = displayName(data);
  const rank = rankFor(data, staffRoles);
  return (
    <div className={`flex gap-2 px-3 ${showHeader ? 'mt-3' : 'mt-0.5'}`}>
      <div className="w-8 shrink-0">
        {showHeader && <Avatar url={data.member?.avatarUrl} name={name} size="sm" className="mt-0.5" />}
      </div>
      <div className="flex min-w-0 max-w-[88%] flex-col items-start">
        {showHeader && (
          <div className="mb-0.5 flex items-center gap-1.5 px-0.5">
            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{name}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${rank.bg}`}>{rank.label}</span>
          </div>
        )}
        <div className="rounded-2xl bg-gray-100 px-3 py-2 text-gray-900 dark:bg-[#272525] dark:text-gray-100">
          <MessageBody data={data} />
        </div>
        <span className="mt-0.5 px-1 text-[10px] text-gray-400">{formatTime(data.createdAt)}</span>
      </div>
    </div>
  );
}

interface ThreadPanelProps {
  root: FeedMessageType;
  userId: string | null;
  communityId: number;
  staffRoles: Record<string, string>;
  /** Same gate as the main chat input: logged in + member + not muted. */
  canReply: boolean;
  /** Why replying is disabled (login / join / muted), shown in place of the composer. */
  disabledReason: string;
  onSendReply: (content: string, imageUrls?: string[], audioUrl?: string | null, audioDuration?: number | null) => Promise<void>;
  onClose: () => void;
}

export function ThreadPanel({ root, userId, communityId, staffRoles, canReply, disabledReason, onSendReply, onClose }: ThreadPanelProps) {
  const { replies, loading } = useThread(root.id);

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
          <RootMessage data={rootRow} staffRoles={staffRoles} />

          <div className="border-t border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-400 dark:border-gray-700">
            {replies.length > 0
              ? `${replies.length} réponse${replies.length > 1 ? 's' : ''}`
              : loading
                ? 'Chargement…'
                : 'Aucune réponse — sois le premier à répondre.'}
          </div>

          {replies.map((r, i) => {
            const prev = replies[i - 1];
            const showHeader = !prev || prev.memberId !== r.memberId;
            return <ReplyBubble key={r.id} data={replyRow(r)} staffRoles={staffRoles} showHeader={showHeader} />;
          })}
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
