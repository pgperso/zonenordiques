import type { Metadata } from 'next';
import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveSeason, getStandings } from '@/services/poolService';
import { PoolShell } from '../PoolShell';
import { TeamLogo } from '@/components/pool/TeamLogo';
import { fmtPoints, fmtNum } from '@/components/pool/format';
import { BRAND } from '@/lib/brand';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'fr' ? `Classement du pool LNH | ${BRAND.name}` : `NHL pool standings | ${BRAND.nameEn}`;
  return { title, alternates: { canonical: `${BRAND.url}/${locale}/lnh/pool/classement` } };
}

export default async function StandingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('pool.standingsPage');
  const tPool = await getTranslations('pool');
  const supabase = await createClient();
  const season = await getActiveSeason(supabase);
  const standings = season ? await getStandings(supabase, season.id) : [];
  const fmtPts = (n: number) => fmtPoints(n, locale);

  return (
    <PoolShell>
            <h1 className="mb-4 text-xl font-bold text-gray-900 dark:text-gray-100">{t('title', { season: season?.name ?? tPool('title') })}</h1>
            {standings.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
                {t('empty')}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-[#252525]">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">{t('colTeam')}</th>
                      <th className="hidden px-3 py-2 text-right sm:table-cell" title={t('ttGames')}>{t('colGames')}</th>
                      <th className="hidden px-3 py-2 text-right sm:table-cell" title={t('ttAvg')}>{t('colAvg')}</th>
                      <th className="px-3 py-2 text-right" title={t('ttYesterday')}>{t('colYesterday')}</th>
                      <th className="px-3 py-2 text-right">{t('colPoints')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {standings.map((s) => {
                      const move = s.previousRank != null && s.rank != null ? s.previousRank - s.rank : null;
                      const avg = s.gamesCounted > 0 ? s.fantasyPoints / s.gamesCounted : 0;
                      return (
                        <tr key={s.entryId} className="hover:bg-gray-50 dark:hover:bg-[#252525]">
                          <td className="px-3 py-2 whitespace-nowrap tabular-nums text-gray-500">
                            {s.rank ?? '—'}
                            {move != null && move !== 0 && (
                              <span className={`ml-1 text-xs font-semibold ${move > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {move > 0 ? `▲${move}` : `▼${-move}`}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <TeamLogo logo={s.teamLogo} name={s.teamName} size={28} />
                              <div className="min-w-0">
                                <Link href={`/lnh/pool/equipe/${s.entryId}`} className="block truncate font-medium text-gray-900 hover:underline dark:text-gray-100">{s.teamName}</Link>
                                {s.ownerName && (
                                  <Link href={`/auteurs/${s.ownerName}`} className="flex items-center gap-1 text-xs text-gray-500 hover:underline">
                                    {s.ownerAvatar && (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={s.ownerAvatar} alt="" className="h-3.5 w-3.5 rounded-full object-cover" />
                                    )}
                                    @{s.ownerName}
                                  </Link>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="hidden px-3 py-2 text-right tabular-nums text-gray-500 sm:table-cell">{s.gamesCounted}</td>
                          <td className="hidden px-3 py-2 text-right tabular-nums text-gray-500 sm:table-cell">{fmtNum(avg, locale, 1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300">
                            {s.pointsLastDay > 0 ? `+${fmtPts(s.pointsLastDay)}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtPts(s.fantasyPoints)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
    </PoolShell>
  );
}
