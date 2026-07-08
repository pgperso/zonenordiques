'use client';

import { memo } from 'react';
import type { FeedItem as FeedItemType, FeedMessage as FeedMessageType } from '@arena/shared';
import { FeedMessage } from './FeedMessage';
import { FeedArticleCard } from './FeedArticleCard';
import { FeedPodcastCard } from './FeedPodcastCard';
import { PoolPromoCard, POOL_PROMO_SENTINEL } from './PoolPromoCard';

interface FeedItemProps {
  item: FeedItemType;
  userId: string | null;
  canModerate: boolean;
  communityId: number;
  communitySlug: string;
  isHighlighted?: boolean;
  isGrouped?: boolean;
  editingMessageId?: number | null;
  staffRoles?: Record<string, string>;
  onDeleteMessage: (messageId: number) => void;
  onEditMessage: (messageId: number, content: string) => void;
  onStartEdit: (messageId: number | null) => void;
  onReply: (message: FeedMessageType) => void;
  onScrollToMessage?: (messageId: number) => void;
  getMessageById: (id: number) => FeedMessageType | undefined;
  onRoleChanged?: (memberId: string, newRole: string | null) => void;
  onlineStatuses?: Record<string, 'online' | 'idle'>;
}

export const FeedItem = memo(function FeedItem({
  item,
  userId,
  canModerate,
  communityId,
  communitySlug,
  isHighlighted,
  isGrouped,
  editingMessageId,
  staffRoles,
  onDeleteMessage,
  onEditMessage,
  onStartEdit,
  onReply,
  onScrollToMessage,
  getMessageById,
  onRoleChanged,
  onlineStatuses,
}: FeedItemProps) {
  switch (item.feedType) {
    case 'message':
      // Staff /pool promo: a sentinel message rendered as a standalone card.
      // Only render it when the POSTER is staff — otherwise a member could
      // craft the sentinel directly and fake a promo card. staffRoles is
      // computed server-side, so this gate can't be bypassed client-side.
      if (item.content === POOL_PROMO_SENTINEL) {
        const posterRole = staffRoles?.[item.memberId ?? ''];
        if (posterRole === 'owner' || posterRole === 'admin' || posterRole === 'moderator') {
          return <PoolPromoCard messageId={item.id} userId={userId} canModerate={canModerate} />;
        }
        return null; // faked sentinel from a non-staff member — ignore it
      }
      return (
        <FeedMessage
          message={item}
          isOwn={item.memberId === userId}
          canModerate={canModerate}
          userId={userId}
          communityId={communityId}
          isHighlighted={isHighlighted}
          isGrouped={isGrouped}
          editing={editingMessageId === item.id}
          staffRole={staffRoles?.[item.memberId ?? '']}
          onDelete={onDeleteMessage}
          onEdit={onEditMessage}
          onStartEdit={() => onStartEdit(item.id)}
          onCancelEdit={() => onStartEdit(null)}
          onReply={onReply}
          onScrollToMessage={onScrollToMessage}
          getMessageById={getMessageById}
          onRoleChanged={onRoleChanged}
          presenceStatus={onlineStatuses?.[item.memberId ?? '']}
        />
      );
    case 'article':
      return (
        <FeedArticleCard
          article={item}
          communitySlug={communitySlug}
          userId={userId}
          canModerate={canModerate}
        />
      );
    case 'podcast':
      return (
        <FeedPodcastCard
          podcast={item}
          communitySlug={communitySlug}
          userId={userId}
          canModerate={canModerate}
        />
      );
    default:
      return null;
  }
});
