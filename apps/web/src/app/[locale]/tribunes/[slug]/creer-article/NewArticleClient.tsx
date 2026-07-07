'use client';

import { useRouter } from '@/i18n/navigation';
import { ArticleEditor } from '@/components/article/ArticleEditor';

interface Props {
  communityId: number;
  communitySlug: string;
  userId: string;
}

export function NewArticleClient({ communityId, communitySlug, userId }: Props) {
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
        onPublished={(slug, cslug) => router.push(`/tribunes/${cslug}/articles/${slug}`)}
        onCancel={() => router.push('/')}
      />
    </div>
  );
}
