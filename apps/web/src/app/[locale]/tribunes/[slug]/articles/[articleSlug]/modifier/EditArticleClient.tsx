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
        // Always replace toward the article (never push/back), so the editor
        // never stays in history — the article's "Retour" then goes to
        // wherever the reader came from, never back into the editor.
        onPublished={(slug, cslug) => router.replace(`/tribunes/${cslug}/articles/${slug}`)}
        onCancel={() => router.replace(`/tribunes/${communitySlug}/articles/${existingArticle.slug}`)}
      />
    </div>
  );
}
