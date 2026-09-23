'use server';

import { revalidatePath } from 'next/cache';
import { routing } from '@/i18n/routing';
import { createClient } from '@/lib/supabase/server';
import { isContentCreator } from '@/lib/authz';
import { consumeRateLimit } from '@/lib/rateLimit';

/**
 * Bust the ISR cache on every surface a freshly published article shows up:
 * the home gallery, the parent tribune hub, and the article page itself.
 * Without this, the home page's `revalidate = 300` would keep serving the
 * cached version for up to 5 minutes after publication — long enough for
 * the author to think the publish didn't take.
 *
 * Called from client components via a Server Action; revalidatePath itself
 * only runs server-side.
 *
 * Security: a Server Action is invocable by anyone who knows its id (present
 * in the client bundle), so it must authorize itself — otherwise an anonymous
 * loop could purge the ISR cache continuously (origin/DB load amplification).
 * Only signed-in content creators may trigger it, rate-limited, with slugs
 * validated so arbitrary paths can't be purged.
 */
const SLUG = /^[a-z0-9-]{1,120}$/;

async function authorizeRevalidate(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (!(await isContentCreator(supabase, user.id))) return null;
  const { allowed } = await consumeRateLimit(`revalidate:${user.id}`, 30, 60 * 60);
  return allowed ? user.id : null;
}

export async function revalidateAfterArticleChange(
  communitySlug: string,
  articleSlug: string,
): Promise<void> {
  if (!SLUG.test(communitySlug) || !SLUG.test(articleSlug)) return;
  if (!(await authorizeRevalidate())) return;
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
  if (!SLUG.test(communitySlug)) return;
  if (!(await authorizeRevalidate())) return;
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}`);
    revalidatePath(`/${locale}/tribunes/${communitySlug}`);
  }
}
