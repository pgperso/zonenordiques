import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@arena/supabase-client';
import { MAX_COMMUNITIES_PER_USER } from '@arena/shared';
import { announceJoin, checkMilestone } from './botService';

export async function joinCommunity(
  supabase: SupabaseClient<Database>,
  communityId: number,
  memberId: string,
) {
  const { count } = await supabase
    .from('community_members')
    .select('id', { count: 'exact', head: true })
    .eq('member_id', memberId);

  if (count !== null && count >= MAX_COMMUNITIES_PER_USER) {
    return { data: null, error: { message: `Vous ne pouvez pas rejoindre plus de ${MAX_COMMUNITIES_PER_USER} tribunes.` } };
  }

  const result = await supabase.from('community_members').insert({
    community_id: communityId,
    member_id: memberId,
  });

  // Bot announcements — must await before returning so router.refresh()
  // doesn't kill the connection before the RPC calls complete
  if (!result.error) {
    const [{ data: member }, { data: community }] = await Promise.all([
      supabase.from('members').select('username').eq('id', memberId).single(),
      supabase.from('communities').select('name').eq('id', communityId).single(),
    ]);

    if (member && community) {
      const username = (member as { username: string }).username;
      const communityName = (community as { name: string }).name;
      await Promise.all([
        announceJoin(supabase, communityId, username, communityName),
        checkMilestone(supabase, communityId, communityName),
      ]);
    }
  }

  return result;
}

export interface UserCommunitySummary {
  id: number;
  name: string;
  slug: string;
}

export async function fetchUserCommunities(
  supabase: SupabaseClient<Database>,
  memberId: string,
): Promise<UserCommunitySummary[]> {
  const { data: memberships } = await supabase
    .from('community_members')
    .select('community_id')
    .eq('member_id', memberId);

  const ids = (memberships ?? []).map((m) => m.community_id);
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from('communities')
    .select('id, name, slug')
    .in('id', ids)
    .eq('is_active', true)
    .order('name');

  return (data ?? []) as UserCommunitySummary[];
}

export async function leaveCommunity(
  supabase: SupabaseClient<Database>,
  communityId: number,
  memberId: string,
) {
  return supabase
    .from('community_members')
    .delete()
    .eq('community_id', communityId)
    .eq('member_id', memberId);
}
