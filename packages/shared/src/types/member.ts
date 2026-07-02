export interface Member {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  description: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemberProfile extends Member {
  communities: CommunityMembership[];
}

export interface CommunityMembership {
  communityId: number;
  communityName: string;
  communitySlug: string;
  role: MemberRole;
  joinedAt: string;
}

export type MemberRole = 'owner' | 'admin' | 'moderator' | 'member';

export interface MemberRestriction {
  id: number;
  communityId: number;
  memberId: string;
  restrictionType: RestrictionType;
  reason: string | null;
  startsAt: string;
  endsAt: string | null;
  createdBy: string;
  createdAt: string;
}

export type RestrictionType = 'chat:mute' | 'community:ban';
