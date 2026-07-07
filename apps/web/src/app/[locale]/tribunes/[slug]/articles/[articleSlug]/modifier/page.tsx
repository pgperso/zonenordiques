import { notFound, redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { EditArticleClient } from './EditArticleClient';

// Auth-gated editor for an existing article — never cached.
export const dynamic = 'force-dynamic';

interface EditPageProps {
  params: Promise<{ locale: string; slug: string; articleSlug: string }>;
}

export default async function EditArticlePage({ params }: EditPageProps) {
  const { locale, slug, articleSlug } = await params;
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

  const { data: article } = await supabase
    .from('articles')
    .select(
      'id, title, slug, excerpt, body, cover_image_url, cover_position_y, is_published, author_name_override, section, author_id',
    )
    .eq('community_id', comm.id)
    .eq('slug', articleSlug)
    .eq('is_removed', false)
    .single();
  if (!article) notFound();
  const a = article as unknown as {
    id: number; title: string; slug: string; excerpt: string | null; body: string;
    cover_image_url: string | null; cover_position_y: number | null; is_published: boolean;
    author_name_override: string | null; section: 'nordiques' | 'lnh' | 'taverne' | null; author_id: string;
  };

  // Authorized when the viewer is the author OR an admin/moderator/owner of
  // the community — mirrors the "Moderators can update any article" RLS.
  let authorized = a.author_id === user.id;
  if (!authorized) {
    const { data: roleRows } = await supabase
      .from('community_member_roles')
      .select('roles!inner(code)')
      .eq('community_id', comm.id)
      .eq('member_id', user.id);
    const codes = ((roleRows ?? []) as { roles: { code: string } | null }[])
      .map((r) => r.roles?.code)
      .filter(Boolean);
    authorized = codes.some((c) => c === 'admin' || c === 'moderator' || c === 'owner');
  }
  if (!authorized) redirect(`/${locale}/tribunes/${slug}/articles/${articleSlug}`);

  return (
    <EditArticleClient
      existingArticle={{
        id: a.id,
        title: a.title,
        slug: a.slug,
        excerpt: a.excerpt,
        body: a.body,
        cover_image_url: a.cover_image_url,
        cover_position_y: a.cover_position_y,
        is_published: a.is_published,
        author_name_override: a.author_name_override,
        section: a.section,
      }}
      communityId={comm.id}
      communitySlug={comm.slug}
      userId={user.id}
    />
  );
}
