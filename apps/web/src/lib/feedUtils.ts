import type { FeedItem } from '@arena/shared';

const GROUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a message should be visually grouped with the previous item.
 * Same author, within 5 minutes, not a reply, neither removed.
 */
export function isGroupedMessage(current: FeedItem, previous: FeedItem): boolean {
  if (current.feedType !== 'message' || previous.feedType !== 'message') return false;
  if (current.parentId) return false;
  if (current.isRemoved || previous.isRemoved) return false;
  if (current.memberId !== previous.memberId) return false;

  const gap = new Date(current.feedTimestamp).getTime() - new Date(previous.feedTimestamp).getTime();
  return gap < GROUP_WINDOW_MS;
}
