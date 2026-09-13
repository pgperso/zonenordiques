import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@arena/supabase-client';
import { SITE } from '@/lib/siteConfig';

/**
 * Brand content scoping.
 *
 * The database is shared across brands (Zone Nordiques / Zone Expos run on the
 * same Supabase, so members are shared). Content is separated by SPORT: every
 * public surface only shows communities in the brand's own category
 * (`SITE.category`), plus a couple of always-included tribunes:
 *   - La Taverne (`la-taverne`): the sport-agnostic off-topic tribune, shown
 *     on every brand.
 *   - The brand's flagship tribune (`SITE.mainTribune`): included explicitly so
 *     it never disappears from its own site even if its category_id is unset.
 *
 * The resolved id set is passed as `communityIds` to pressGalleryService and
 * the other listing/SEO surfaces, all of which already support that filter.
 */

// Tribunes shown on this brand regardless of their category_id.
function alwaysIncludeSlugs(): string[] {
  return Array.from(new Set(['la-taverne', SITE.mainTribune]));
}

/**
 * Community ids whose content this brand may show. A `null`/unknown category
 * falls back to just the always-include tribunes rather than the whole DB, so
 * a misconfigured `NEXT_PUBLIC_SITE_CATEGORY` fails closed (brand shows only its
 * flagship + Taverne) instead of leaking every sport.
 */
export async function getBrandCommunityIds(
  supabase: SupabaseClient<Database>,
): Promise<number[]> {
  const includeSlugs = alwaysIncludeSlugs();

  const { data: cat } = await supabase
    .from('categories')
    .select('id')
    .eq('slug', SITE.category)
    .maybeSingle();

  const categoryId = (cat as { id: number } | null)?.id ?? null;

  let query = supabase.from('communities').select('id');
  query =
    categoryId != null
      ? query.or(`category_id.eq.${categoryId},slug.in.(${includeSlugs.join(',')})`)
      : query.in('slug', includeSlugs);

  const { data } = await query;
  return ((data ?? []) as Array<{ id: number }>).map((c) => c.id);
}
