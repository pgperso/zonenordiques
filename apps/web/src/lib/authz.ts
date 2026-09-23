import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side role checks shared by API routes and Server Actions.
 * Mirrors the RLS role model: 'owner' is global; admin/moderator/creator are
 * per-community. "Can create content" = holds any of those roles anywhere —
 * the same set the articles/podcasts INSERT policies accept.
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
