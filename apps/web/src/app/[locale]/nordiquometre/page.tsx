import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { Nordiquometre } from '@/components/feed/Nordiquometre';
import { BRAND } from '@/lib/brand';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isFr = locale === 'fr';
  const title = isFr
    ? `Nordiquomètre — l’indice de confiance du retour des Nordiques | ${BRAND.name}`
    : `Nordiquometer — the Nordiques return confidence index | ${BRAND.nameEn}`;
  const description = isFr
    ? 'Vote au Nordiquomètre : à quel point crois-tu au retour des Nordiques de Québec ? Sur 3 horizons (0-3, 3-5, 5-10 ans). Le pouls des partisans en direct.'
    : 'Vote on the Nordiquometer: how strongly do you believe the Quebec Nordiques will return? Across 3 horizons. The live pulse of the fans.';
  const url = `${BRAND.url}/${locale}/nordiquometre`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url,
      siteName: BRAND.name,
      locale: isFr ? 'fr_CA' : 'en_CA',
      images: [{ url: BRAND.logoUrl, alt: 'Nordiquomètre', width: BRAND.logoWidth, height: BRAND.logoHeight }],
    },
    twitter: { card: 'summary_large_image', title, description },
    alternates: {
      canonical: url,
      languages: {
        'fr-CA': `${BRAND.url}/fr/nordiquometre`,
        'en-CA': `${BRAND.url}/en/nordiquometre`,
        'x-default': `${BRAND.url}/fr/nordiquometre`,
      },
    },
    robots: { index: true, follow: true, 'max-snippet': -1, 'max-image-preview': 'large' },
  };
}

export default async function NordiquometrePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();

  // canModerate = global owner (can reset the meter). Vote-gating itself
  // lives in the component, which invites anonymous visitors to register.
  const { data: { user } } = await supabase.auth.getUser();
  let canModerate = false;
  if (user) {
    const { data } = await supabase
      .from('community_member_roles')
      .select('id, roles!inner(code)')
      .eq('member_id', user.id)
      .eq('roles.code', 'owner')
      .limit(1);
    canModerate = ((data as unknown[] | null)?.length ?? 0) > 0;
  }

  const isFr = locale === 'fr';

  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col bg-white dark:bg-[#1e1e1e]"
      style={{ height: 'calc(100dvh - 4rem)' }}
    >
      <header className="shrink-0 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          {isFr ? 'Nordiquomètre' : 'Nordiquometer'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {isFr
            ? 'L’indice de confiance du retour des Nordiques'
            : 'The confidence index for the Nordiques’ return'}
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <Nordiquometre canModerate={canModerate} />
      </div>
    </div>
  );
}
