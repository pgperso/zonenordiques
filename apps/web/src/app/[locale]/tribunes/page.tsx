import type { Metadata } from 'next';
import { redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';
import { setRequestLocale } from 'next-intl/server';
import { TribunesClient } from './TribunesClient';
import { BRAND } from '@/lib/brand';
import { getBrandCommunityIds } from '@/lib/brandScope';
import type { Database } from '@arena/supabase-client';

type CommunityRow = Database['public']['Tables']['communities']['Row'];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isFr = locale === 'fr';
  const title = isFr
    ? `Mes tribunes | ${BRAND.name}`
    : `My tribunes | ${BRAND.nameEn}`;
  const description = isFr
    ? 'Accédez à vos tribunes sportives et rejoignez de nouvelles communautés.'
    : 'Access your sports tribunes and join new communities.';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${BRAND.url}/${locale}/tribunes`,
      siteName: BRAND.name,
      locale: isFr ? 'fr_CA' : 'en_CA',
      images: [{ url: BRAND.logoUrl, alt: BRAND.name, width: BRAND.logoWidth, height: BRAND.logoHeight }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [BRAND.logoUrl],
    },
    alternates: {
      canonical: `${BRAND.url}/${locale}/tribunes`,
      languages: {
        'fr-CA': `${BRAND.url}/fr/tribunes`,
        'en-CA': `${BRAND.url}/en/tribunes`,
        'x-default': `${BRAND.url}/fr/tribunes`,
      },
    },
    robots: { index: false, follow: false },
  };
}

export default async function TribunesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  // Non-logged-in visitors (including Googlebot) get sent to the home, which
  // is the public Press Gallery, instead of a login wall.
  if (!user) return redirect({ href: '/', locale });

  // Fetch user's joined communities
  const { data: memberships } = await supabase
    .from('community_members')
    .select('community_id')
    .eq('member_id', user.id);

  const joinedIds = (memberships ?? []).map((m) => m.community_id);

  // Content is separated by sport: on Zone Expos this list shows only the
  // baseball tribunes the member joined, never their hockey ones (shared DB).
  const brandCommunityIds = await getBrandCommunityIds(supabase);
  const brandSet = new Set(brandCommunityIds);
  const visibleJoinedIds = joinedIds.filter((id) => brandSet.has(id));

  let communities: CommunityRow[] = [];
  if (visibleJoinedIds.length > 0) {
    const { data } = await supabase
      .from('communities')
      .select('id, name, name_en, slug, description, description_en, member_count, primary_color, logo_url')
      .in('id', visibleJoinedIds)
      .eq('is_active', true)
      .order('name');
    // name_en / description_en come from migration 00053. Cast through unknown
    // until generated Supabase types are regenerated post-deploy.
    communities = (data ?? []) as unknown as CommunityRow[];
  }

  return (
    <TribunesClient
      communities={communities}
      userId={user.id}
      memberCommunityIds={joinedIds}
    />
  );
}
