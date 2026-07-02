'use server';

import { revalidatePath } from 'next/cache';
import { routing } from '@/i18n/routing';

/**
 * Bust the ISR cache on every surface a freshly published article shows up:
 * the home gallery, the parent tribune hub, and the article page itself.
 * Without this, the home page's `revalidate = 300` would keep serving the
 * cached version for up to 5 minutes after publication — long enough for
 * the author to think the publish didn't take.
 *
 * Called from client components via a Server Action; revalidatePath itself
 * only runs server-side.
 */
export async function revalidateAfterArticleChange(
  communitySlug: string,
  articleSlug: string,
): Promise<void> {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}`);
    revalidatePath(`/${locale}/tribunes/${communitySlug}`);
    revalidatePath(`/${locale}/tribunes/${communitySlug}/articles/${articleSlug}`);
  }
}

/**
 * Same idea for podcasts — narrower surface set (no per-episode hub URL is
 * SEO-relevant, so we only refresh home + tribune).
 */
export async function revalidateAfterPodcastChange(
  communitySlug: string,
): Promise<void> {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}`);
    revalidatePath(`/${locale}/tribunes/${communitySlug}`);
  }
}
