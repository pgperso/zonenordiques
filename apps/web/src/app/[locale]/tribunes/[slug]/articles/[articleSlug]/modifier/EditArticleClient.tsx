'use client';

import { useRouter } from '@/i18n/navigation';
import { ArticleEditor } from '@/components/article/ArticleEditor';

interface ExistingArticle {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string;
  cover_image_url: string | null;
  cover_position_y?: number | null;
  is_published: boolean;
  author_name_override?: string | null;
  section?: 'nordiques' | 'lnh' | 'taverne' | null;
}

interface Props {
  existingArticle: ExistingArticle;
  communityId: number;
  communitySlug: string;
  userId: string;
}

export function EditArticleClient({ existingArticle, communityId, communitySlug, userId }: Props) {
  const router = useRouter();
  const backToArticle = () =>
    router.push(`/tribunes/${communitySlug}/articles/${existingArticle.slug}`);

  return (
    <div
      className="mx-auto w-full max-w-4xl overflow-y-auto px-4 py-6"
      style={{ height: 'calc(100dvh - 4rem)' }}
    >
      <ArticleEditor
        communityId={communityId}
        communitySlug={communitySlug}
        userId={userId}
        existingArticle={existingArticle}
        onPublished={(slug, cslug) => router.push(`/tribunes/${cslug}/articles/${slug}`)}
        onCancel={backToArticle}
      />
    </div>
  );
}
