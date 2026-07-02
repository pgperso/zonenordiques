import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@arena/supabase-client';

export async function findMemberByUsername(
  supabase: SupabaseClient<Database>,
  username: string,
) {
  return supabase
    .from('members')
    .select('id')
    .eq('username', username)
    .single();
}

export async function checkCommunityMembership(
  supabase: SupabaseClient<Database>,
  communityId: number,
  memberId: string,
) {
  return supabase
    .from('community_members')
    .select('id')
    .eq('community_id', communityId)
    .eq('member_id', memberId)
    .maybeSingle();
}

export async function applyRestriction(
  supabase: SupabaseClient<Database>,
  data: {
    communityId: number;
    memberId: string;
    restrictionType: string;
    reason: string | null;
    endsAt: string | null;
  },
) {
  return supabase.from('member_restrictions').insert({
    community_id: data.communityId,
    member_id: data.memberId,
    restriction_type: data.restrictionType,
    reason: data.reason,
    ends_at: data.endsAt,
  });
}

export async function removeRestriction(
  supabase: SupabaseClient<Database>,
  restrictionId: number,
) {
  return supabase
    .from('member_restrictions')
    .delete()
    .eq('id', restrictionId);
}

export async function fetchRestrictions(
  supabase: SupabaseClient<Database>,
  communityId: number,
) {
  return supabase
    .from('member_restrictions')
    .select('id, community_id, member_id, restriction_type, reason, starts_at, ends_at, created_at, members:members!member_restrictions_member_id_fkey(username)')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
    .limit(200);
}

// ── Role management ──

export async function fetchMemberRoles(
  supabase: SupabaseClient<Database>,
  memberId: string,
) {
  return supabase
    .from('community_member_roles')
    .select('id, community_id, role_id, roles(code, name)')
    .eq('member_id', memberId);
}

export async function assignRole(
  supabase: SupabaseClient<Database>,
  data: { communityId: number; memberId: string; roleCode: string },
) {
  // Look up role_id from code
  const { data: role } = await supabase
    .from('roles')
    .select('id')
    .eq('code', data.roleCode)
    .single();

  if (!role) return { error: { message: 'Rôle introuvable' } };

  const roleId = (role as { id: number }).id;

  // Remove existing roles for this member in this community, then insert the new one
  await supabase
    .from('community_member_roles')
    .delete()
    .eq('community_id', data.communityId)
    .eq('member_id', data.memberId);

  const { error } = await supabase
    .from('community_member_roles')
    .insert({
      community_id: data.communityId,
      member_id: data.memberId,
      role_id: roleId,
    });

  return { error };
}

export async function removeRole(
  supabase: SupabaseClient<Database>,
  data: { communityId: number; memberId: string },
) {
  return supabase
    .from('community_member_roles')
    .delete()
    .eq('community_id', data.communityId)
    .eq('member_id', data.memberId);
}
