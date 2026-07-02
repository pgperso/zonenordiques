export type FeedItemType = 'message' | 'article' | 'podcast';

export interface FeedMember {
  id: string;
  username: string;
  avatarUrl: string | null;
  messageCount: number;
}

interface FeedItemBase {
  feedType: FeedItemType;
  feedKey: string;
  feedTimestamp: string;
  communityId: number;
}

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  domain: string;
}

export interface FeedMessage extends FeedItemBase {
  feedType: 'message';
  id: number;
  memberId: string | null;
  content: string | null;
  imageUrls: string[];
  linkPreviews: LinkPreview[];
  parentId: number | null;
  likeCount: number;
  dislikeCount: number;
  replyCount: number;
  editedAt: string | null;
  isRemoved: boolean;
  removedAt: string | null;
  removedBy: string | null;
  createdAt: string;
  member: FeedMember | null;
}

export interface FeedArticle extends FeedItemBase {
  feedType: 'article';
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImageUrl: string | null;
  likeCount: number;
  viewCount: number;
  publishedAt: string;
  author: FeedMember;
}

export interface FeedPodcast extends FeedItemBase {
  feedType: 'podcast';
  id: number;
  title: string;
  description: string | null;
  audioUrl: string | null;
  coverImageUrl: string | null;
  durationSeconds: number | null;
  youtubeVideoId: string | null;
  isLive: boolean;
  likeCount: number;
  createdAt: string;
  publisher: FeedMember | null;
}

export type FeedItem = FeedMessage | FeedArticle | FeedPodcast;
