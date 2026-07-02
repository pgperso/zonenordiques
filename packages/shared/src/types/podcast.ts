export interface Podcast {
  id: number;
  communityId: number;
  title: string;
  description: string | null;
  audioUrl: string;
  durationSeconds: number | null;
  publishedBy: string | null;
  coverImageUrl: string | null;
  isPublished: boolean;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
  publisher?: {
    id: string;
    username: string;
    avatarUrl: string | null;
  };
}
