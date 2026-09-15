import { notFound, redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { NewPodcastClient } from './NewPodcastClient';

// Auth-gated content creation — never cached.
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ locale: string; slug: string }>;
}

async function canCreate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  communityId: number,
  userId: string,
): Promise<boolean> {
  // 'owner' is GLOBAL (create in any community); the others are community-scoped.
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

export default async function NewPodcastPage({ params }: Props) {
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

  return <NewPodcastClient communityId={comm.id} communitySlug={comm.slug} userId={user.id} />;
}
