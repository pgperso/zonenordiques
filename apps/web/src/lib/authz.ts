import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side role checks shared by API routes and Server Actions.
 * Mirrors the RLS role model: 'owner' is global; admin/moderator/creator are
 * per-community. "Can create content" = holds any of those roles anywhere —
 * the same set the articles/podcasts INSERT policies accept.
 *
 * `owner` is global ACROSS BRANDS, deliberately (2026-09-24): the same person
 * owns Zone Nordiques, Zone Expos and CFL Québec, so an owner of one is an
 * owner of all three — including the ability to trigger another brand's
 * newsletter cron and poll rotation.
 *
 * This is a decision, not an oversight, and it has an expiry date: the day a
 * brand is handed to someone else, `owner` has to become per-brand (scope the
 * `community_member_roles` lookups by category, and add a category predicate
 * to `is_global_owner()` and the storage policies in migration 00106).
 */
export async function isContentCreator(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('community_member_roles')
    .select('id, roles!inner(code)')
    .eq('member_id', userId)
    .in('roles.code', ['owner', 'admin', 'moderator', 'creator'])
    .limit(1);
  return Boolean((data as unknown[] | null)?.length);
}
