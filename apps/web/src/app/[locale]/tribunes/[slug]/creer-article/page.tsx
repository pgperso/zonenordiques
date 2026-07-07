import { notFound, redirect } from 'next/navigation';
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
  const { data } = await supabase
    .from('community_member_roles')
    .select('roles!inner(code)')
    .eq('community_id', communityId)
    .eq('member_id', userId);
  const codes = ((data ?? []) as { roles: { code: string } | null }[])
    .map((r) => r.roles?.code)
    .filter(Boolean);
  return codes.some((c) => c === 'admin' || c === 'moderator' || c === 'owner' || c === 'creator');
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
  if (!community) notFound();
  const comm = community as { id: number; slug: string };

  if (!(await canCreate(supabase, comm.id, user.id))) {
    redirect(`/${locale}/tribunes/${slug}`);
  }

  return <NewArticleClient communityId={comm.id} communitySlug={comm.slug} userId={user.id} />;
}
