'use client';

import { useRouter } from '@/i18n/navigation';
import { PodcastEditor } from '@/components/podcast/PodcastEditor';

interface Props {
  communityId: number;
  communitySlug: string;
  userId: string;
}

export function NewPodcastClient({ communityId, communitySlug, userId }: Props) {
  const router = useRouter();
  return (
    <div
      className="mx-auto w-full max-w-4xl overflow-y-auto px-4 py-6"
      style={{ height: 'calc(100dvh - 4rem)' }}
    >
      <PodcastEditor
        communityId={communityId}
        userId={userId}
        onSaved={() => router.replace(`/tribunes/${communitySlug}`)}
        onCancel={() => router.back()}
      />
    </div>
  );
}
