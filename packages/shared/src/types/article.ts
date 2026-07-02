export interface Article {
  id: number;
  communityId: number;
  authorId: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string;
  coverImageUrl: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  likeCount: number;
  viewCount: number;
  isRemoved: boolean;
  removedAt: string | null;
  removedBy: string | null;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}
