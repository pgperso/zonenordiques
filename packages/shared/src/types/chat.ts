export interface ChatMessage {
  id: number;
  communityId: number;
  memberId: string | null;
  content: string | null;
  parentId: number | null;
  imageUrls: string[];
  likeCount: number;
  replyCount: number;
  isRemoved: boolean;
  removedAt: string | null;
  removedBy: string | null;
  createdAt: string;
  member?: ChatMessageMember;
}

export interface ChatMessageMember {
  id: string;
  username: string;
  avatarUrl: string | null;
  role: string;
}

export interface ChatPresence {
  memberId: string;
  username: string;
  avatarUrl: string | null;
  role: string;
  clientType: 'web' | 'mobile';
  lastSeenAt: string;
}
