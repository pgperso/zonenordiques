import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { setRequestLocale } from 'next-intl/server';
import { VestiaireClient } from './VestiaireClient';
import { fetchPendingPolls, fetchScheduledPolls, fetchActivePoll, type Poll } from '@/services/pollService';
import { BRAND } from '@/lib/brand';
import type { Database } from '@arena/supabase-client';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isFr = locale === 'fr';
  const title = isFr
    ? `Mon vestiaire | ${BRAND.name}`
    : `My locker | ${BRAND.nameEn}`;
  const description = isFr
    ? 'Gérez votre profil, vos tribunes et vos publications.'
    : 'Manage your profile, your tribunes and your publications.';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
      url: `${BRAND.url}/${locale}/vestiaire`,
      siteName: BRAND.name,
      locale: isFr ? 'fr_CA' : 'en_CA',
      images: [{ url: BRAND.logoUrl, alt: BRAND.name, width: BRAND.logoWidth, height: BRAND.logoHeight }],
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: [BRAND.logoUrl],
    },
    alternates: {
      canonical: `${BRAND.url}/${locale}/vestiaire`,
      languages: {
        'fr-CA': `${BRAND.url}/fr/vestiaire`,
        'en-CA': `${BRAND.url}/en/vestiaire`,
        'x-default': `${BRAND.url}/fr/vestiaire`,
      },
    },
    robots: { index: false, follow: false },
  };
}

type CommunityRow = Database['public']['Tables']['communities']['Row'];

export default async function VestiairePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirect=/vestiaire');
  }

  // Fetch member profile
  const { data: member } = await supabase
    .from('members')
    .select('id, username, avatar_url, description, creator_display_name, creator_avatar_url, created_at')
    .eq('id', user.id)
    .single();

  // Fetch communities the user belongs to
  const { data: memberships } = await supabase
    .from('community_members')
    .select('community_id, joined_at')
    .eq('member_id', user.id)
    .limit(500);

  let communities: CommunityRow[] = [];
  if (memberships && memberships.length > 0) {
    const communityIds = memberships.map((m) => m.community_id);
    const { data } = await supabase
      .from('communities')
      .select('id, name, slug, description, member_count, primary_color, logo_url')
      .in('id', communityIds)
      .eq('is_active', true)
      .order('name');
    communities = (data ?? []) as CommunityRow[];
  }

  // Check if user is a global owner
  const { data: ownerCheck } = await supabase
    .from('community_member_roles')
    .select('id, roles!inner(code)')
    .eq('member_id', user.id)
    .eq('roles.code', 'owner')
    .limit(1);

  const isOwner = ((ownerCheck as unknown[] | null)?.length ?? 0) > 0;

  // Check if user can create content (owner, admin, or creator role anywhere)
  const isContentCreator = isOwner || await (async () => {
    const { data: creatorCheck } = await supabase
      .from('community_member_roles')
      .select('id, roles!inner(code)')
      .eq('member_id', user.id)
      .in('roles.code' as never, ['admin', 'creator'] as never)
      .limit(1);
    return ((creatorCheck as unknown[] | null)?.length ?? 0) > 0;
  })();

  // Fetch per-community roles
  const { data: memberRoles } = await supabase
    .from('community_member_roles')
    .select('community_id, roles(code)')
    .eq('member_id', user.id)
    .limit(500);

  const roleMap = new Map<number, string>();

  // If owner: set 'owner' role on ALL communities
  if (isOwner) {
    communities.forEach((c) => roleMap.set(c.id, 'owner'));
  }

  // Layer per-community roles (owner already set takes precedence)
  memberRoles?.forEach((r) => {
    const role = r.roles as unknown as { code: string } | null;
    if (role && !isOwner) roleMap.set(r.community_id, role.code);
  });

  // Admin stats: owners get stats for ALL their communities
  const adminCommunityIds = isOwner
    ? communities.map((c) => c.id)
    : Array.from(roleMap.keys());

  let adminStats: Record<number, { articles: number; drafts: number; podcasts: number }> = {};

  if (adminCommunityIds.length > 0) {
    const [articlesRes, draftsRes, podcastsRes] = await Promise.all([
      supabase
        .from('articles')
        .select('community_id', { count: 'exact', head: false })
        .in('community_id', adminCommunityIds)
        .eq('is_published', true)
        .eq('is_removed', false),
      supabase
        .from('articles')
        .select('community_id', { count: 'exact', head: false })
        .in('community_id', adminCommunityIds)
        .eq('is_published', false)
        .eq('is_removed', false),
      supabase
        .from('podcasts')
        .select('community_id', { count: 'exact', head: false })
        .in('community_id', adminCommunityIds)
        .eq('is_published', true)
        .or('is_removed.eq.false,is_removed.is.null'),
    ]);

    const stats: Record<number, { articles: number; drafts: number; podcasts: number }> = {};
    for (const id of adminCommunityIds) {
      stats[id] = { articles: 0, drafts: 0, podcasts: 0 };
    }
    (articlesRes.data ?? []).forEach((r) => { if (stats[r.community_id]) stats[r.community_id].articles++; });
    (draftsRes.data ?? []).forEach((r) => { if (stats[r.community_id]) stats[r.community_id].drafts++; });
    (podcastsRes.data ?? []).forEach((r) => { if (stats[r.community_id]) stats[r.community_id].podcasts++; });
    adminStats = stats;
  }

  // Per-author metrics — surfaced in Vestiaire so writers can see their
  // articles' reach (views, likes) instead of just a count. This is the
  // feedback loop that pulls authors back to write another piece.
  const { data: authoredArticles } = await supabase
    .from('articles')
    .select('id, slug, title, view_count, like_count, published_at, communities!inner(slug, name, name_en)')
    .eq('author_id', user.id)
    .eq('is_published', true)
    .eq('is_removed', false)
    .order('view_count', { ascending: false })
    .limit(50);

  type AuthoredRow = {
    id: number;
    slug: string;
    title: string;
    view_count: number;
    like_count: number;
    published_at: string | null;
    communities: { slug: string; name: string; name_en: string | null };
  };

  const authored = (authoredArticles ?? []) as unknown as AuthoredRow[];
  const totalViews = authored.reduce((s, a) => s + (a.view_count || 0), 0);
  const totalLikes = authored.reduce((s, a) => s + (a.like_count || 0), 0);

  // Comments received on user's articles (one query, count by article)
  let totalComments = 0;
  if (authored.length > 0) {
    const ids = authored.map((a) => a.id);
    const { count } = await supabase
      .from('article_comments')
      .select('id', { count: 'exact', head: true })
      .in('article_id', ids)
      .eq('is_removed', false);
    totalComments = count ?? 0;
  }

  // Top 5 articles by views (already sorted by view_count desc above)
  const topArticles = authored.slice(0, 5).map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    viewCount: a.view_count || 0,
    likeCount: a.like_count || 0,
    publishedAt: a.published_at,
    communitySlug: a.communities.slug,
    communityName: a.communities.name,
    communityNameEn: a.communities.name_en,
  }));

  const authorMetrics = {
    publishedCount: authored.length,
    totalViews,
    totalLikes,
    totalComments,
    topArticles,
  };

  // Poll management data — owner only. RLS already restricts pending /
  // scheduled polls to owners, but we skip the queries for non-owners.
  let pendingPolls: Poll[] = [];
  let scheduledPolls: Poll[] = [];
  let activePoll: Poll | null = null;
  if (isOwner) {
    [pendingPolls, scheduledPolls, activePoll] = await Promise.all([
      fetchPendingPolls(supabase).catch(() => []),
      fetchScheduledPolls(supabase).catch(() => []),
      fetchActivePoll(supabase).catch(() => null),
    ]);
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <VestiaireClient
          member={member}
          communities={communities}
          roleMap={Object.fromEntries(roleMap)}
          adminStats={adminStats}
          userEmail={user.email ?? ''}
          isContentCreator={isContentCreator}
          authorMetrics={authorMetrics}
          isOwner={isOwner}
          pendingPolls={pendingPolls}
          scheduledPolls={scheduledPolls}
          activePoll={activePoll}
        />
      </div>
    </div>
  );
}
