import { notFound, redirect } from 'next/navigation';
import { isBrandCommunity } from '@/lib/brandScope';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { NewArticleClient } from './NewArticleClient';

// Auth-gated content creation — never cached.
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

// Members who may publish content in a community: admin / moderator / owner
// (staff) or creator (Journaliste).
async function canCreate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  communityId: number,
  userId: string,
): Promise<boolean> {
  // Fetch ALL of the member's roles: 'owner' is GLOBAL (may create in any
  // community, matching the RLS policies), while admin/moderator/creator only
  // grant creation in their own community.
  const { data } = await supabase
    .from('community_member_roles')
    .select('community_id, roles!inner(code)')
    .eq('member_id', userId);
  const rows = (data ?? []) as { community_id: number; roles: { code: string } | null }[];
  return rows.some((r) => {
    const code = r.roles?.code;
    if (code === 'owner') return true;
    return r.community_id === communityId && (code === 'admin' || code === 'moderator' || code === 'creator');
  });
}

export default async function NewArticlePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${locale}/login`);

  const { data: community } = await supabase
    .from('communities')
    .select('id, slug')
    .eq('slug', slug)
    .single();
  // A slug is global but a brand is not: without this gate any tribune of
  // any sport renders in full on any domain, under that domain's chrome and
  // canonical tag. See isBrandCommunity().
  if (!community || !(await isBrandCommunity(supabase, community.id))) notFound();
  const comm = community as { id: number; slug: string };

  if (!(await canCreate(supabase, comm.id, user.id))) {
    redirect(`/${locale}/tribunes/${slug}`);
  }

  return <NewArticleClient communityId={comm.id} communitySlug={comm.slug} userId={user.id} />;
}
