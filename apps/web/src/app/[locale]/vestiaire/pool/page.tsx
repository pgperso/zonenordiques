import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveSeason, getScoringRules } from '@/services/poolService';
import { PoolAdminClient } from './PoolAdminClient';
import { BRAND } from '@/lib/brand';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'fr' ? `Admin du pool | ${BRAND.name}` : `Pool admin | ${BRAND.nameEn}`;
  return { title, robots: { index: false, follow: false } };
}

export default async function PoolAdminPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/vestiaire/pool');

  // Owner-only — mirrors the Vestiaire gate.
  const { data: ownerCheck } = await supabase
    .from('community_member_roles')
    .select('id, roles!inner(code)')
    .eq('member_id', user.id)
    .eq('roles.code', 'owner')
    .limit(1);
  if (((ownerCheck as unknown[] | null)?.length ?? 0) === 0) redirect('/vestiaire');

  const season = await getActiveSeason(supabase);
  const rules = season ? await getScoringRules(supabase, season.id) : [];

  return (
    <div className="flex flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <PoolAdminClient season={season} rules={rules} />
      </div>
    </div>
  );
}
