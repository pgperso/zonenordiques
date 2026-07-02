import type { Metadata } from 'next';
import Link from 'next/link';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveSeason, getScoringRules, SCORING_CATALOG } from '@/services/poolService';
import { PoolShell } from './PoolShell';
import { BetaNotice } from './BetaNotice';
import { fmtNum } from '@/components/pool/format';
import { BRAND } from '@/lib/brand';

// Public, content-rich, indexable — this is monetized inventory (sidebars +
// anchor) and an SEO surface. The lineup builder (the tool) stays ad-light.
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const isFr = locale === 'fr';
  const title = isFr ? `Pool LNH — classement en direct | ${BRAND.name}` : `NHL Pool — live standings | ${BRAND.nameEn}`;
  const description = isFr
    ? "Le pool de hockey de La tribune des fans. Compose ton alignement à plafond salarial et grimpe au classement."
    : 'The hockey pool from Fans Tribune. Build a salary-cap roster and climb the standings.';
  return {
    title,
    description,
    openGraph: { title, description, url: `${BRAND.url}/${locale}/lnh/pool`, siteName: BRAND.name },
    alternates: { canonical: `${BRAND.url}/${locale}/lnh/pool` },
  };
}

export default async function PoolHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('pool.home');
  const tPool = await getTranslations('pool');
  const tScoring = await getTranslations('pool.scoring');
  const supabase = await createClient();

  const season = await getActiveSeason(supabase);
  const rules = season ? await getScoringRules(supabase, season.id) : [];

  // Barème — only the stats that actually score; labels come from i18n by key.
  const ruleMap = new Map(rules.map((r) => [r.statKey, r.coefficient]));
  const baremeRows = SCORING_CATALOG.map((c) => ({ ...c, coef: ruleMap.get(c.key) ?? 0 })).filter((c) => c.coef !== 0);
  const skaterRules = baremeRows.filter((c) => c.appliesTo === 'skater');
  const goalieRules = baremeRows.filter((c) => c.appliesTo === 'goalie');
  const fmtCoef = (n: number) => (n > 0 ? '+' : '') + fmtNum(n, locale, 2);

  // Rules shown to players are derived from the season config (set in admin),
  // never hardcoded — so the explainer always matches the real rules.
  const rf = season?.rosterF ?? 12;
  const rd = season?.rosterD ?? 6;
  const rg = season?.rosterG ?? 2;
  const rt = season?.rosterTeams ?? 0;
  const budgetM = season ? fmtNum(season.budgetCents / 100_000_000, locale, 1) : '100';
  const lockDateStr = season?.lockAt
    ? new Date(season.lockAt).toLocaleDateString(locale === 'fr' ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const txNote =
    season?.transactionsEnabled && season.maxTransactions > 0
      ? t('txNote', { count: season.maxTransactions })
      : null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Tailor the CTA: existing entry → "Mon équipe", else "Crée ton équipe".
  let myEntryId: number | null = null;
  let myConfirmed = false;
  if (user && season) {
    const { data } = await supabase
      .from('pool_entries')
      .select('id, is_confirmed')
      .eq('season_id', season.id)
      .eq('member_id', user.id)
      .maybeSingle();
    const e = data as { id: number; is_confirmed: boolean } | null;
    myEntryId = e?.id ?? null;
    myConfirmed = e?.is_confirmed ?? false;
  }

  // Registration snapshot: how many teams are in, and how long until lock.
  let registeredCount = 0;
  if (season) {
    const { count } = await supabase
      .from('pool_entries')
      .select('id', { count: 'exact', head: true })
      .eq('season_id', season.id)
      .eq('is_confirmed', true);
    registeredCount = count ?? 0;
  }
  const lockMs = season?.lockAt ? new Date(season.lockAt).getTime() - Date.now() : null;
  const registrationClosed = lockMs != null && lockMs <= 0;
  let timeLeft: string | null = null;
  if (lockMs != null && lockMs > 0) {
    const days = Math.floor(lockMs / 86_400_000);
    const hours = Math.floor((lockMs % 86_400_000) / 3_600_000);
    timeLeft = days >= 1 ? t('timeDaysHours', { days, hours }) : hours >= 1 ? t('timeHours', { hours }) : t('timeSoon');
  }

  // Registration status for the current viewer.
  const reg = !user
    ? { label: t('statusLoginPrompt'), tone: 'muted' as const, href: '/login?redirect=/lnh/pool/composer', cta: t('registerNow') }
    : !myEntryId
      ? { label: t('statusNotRegistered'), tone: 'warn' as const, href: '/lnh/pool/composer', cta: t('registerNow') }
      : !myConfirmed
        ? { label: t('statusToConfirm'), tone: 'warn' as const, href: '/lnh/pool/composer', cta: t('finishRegistration') }
        : { label: t('statusRegistered'), tone: 'ok' as const, href: null, cta: null };

  const cta = myEntryId
    ? { href: '/lnh/pool/moi', label: tPool('myTeam') }
    : { href: user ? '/lnh/pool/composer' : '/login?redirect=/lnh/pool/composer', label: t('ctaCreate') };

  return (
    <PoolShell>
            <BetaNotice />
            {/* Hero / CTA */}
            <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white p-6 dark:border-gray-700 dark:from-[#252525] dark:to-[#1e1e1e]">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('eyebrow')}</p>
              <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
                {season?.name ?? tPool('title')}
              </h1>
              <p className="mt-2 max-w-prose text-sm text-gray-600 dark:text-gray-300">
                {t('heroDesc', { f: rf, d: rd, g: rg, teams: rt, budget: budgetM })}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {season && (
                  <Link
                    href={cta.href}
                    className="rounded-md bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900"
                  >
                    {cta.label}
                  </Link>
                )}
                <Link href="/lnh/pool/classement" className="text-sm font-medium text-gray-600 underline dark:text-gray-300">
                  {t('viewFullStandings')}
                </Link>
              </div>
              {season && !user && !myEntryId && (
                <p className="mt-2 text-xs text-gray-400">{t('loginRequired')}</p>
              )}
            </div>

            {/* Registration status: am I in, how many teams, time left */}
            {season && (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                  <div className="text-xs uppercase tracking-wide text-gray-500">{t('statusLabel')}</div>
                  <div className={`mt-1 text-lg font-bold ${reg.tone === 'ok' ? 'text-green-600 dark:text-green-400' : reg.tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
                    {reg.label}
                  </div>
                  {reg.href && reg.cta && !registrationClosed && (
                    <Link href={reg.href} className="mt-1 inline-block text-xs font-medium text-gray-600 underline hover:text-gray-900 dark:text-gray-300">
                      {reg.cta}
                    </Link>
                  )}
                </div>
                <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                  <div className="text-xs uppercase tracking-wide text-gray-500">{t('teamsLabel')}</div>
                  <div className="mt-1 text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">{t('teamsRegistered', { count: registeredCount })}</div>
                </div>
                <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                  <div className="text-xs uppercase tracking-wide text-gray-500">{t('deadlineLabel')}</div>
                  <div className={`mt-1 text-lg font-bold tabular-nums ${registrationClosed ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                    {registrationClosed ? t('registrationClosed') : timeLeft ?? t('noDeadline')}
                  </div>
                </div>
              </div>
            )}

            {/* Comment ça marche */}
            <section className="mt-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{t('howItWorks')}</h2>
              <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ['1', t('step1Title'), t('step1Desc', { f: rf, d: rd, g: rg, teams: rt, budget: budgetM })],
                  ['2', t('step2Title'), lockDateStr ? t('step2DescDate', { date: lockDateStr }) : t('step2Desc')],
                  ['3', t('step3Title'), t('step3Desc')],
                  ['4', t('step4Title'), t('step4Desc')],
                ].map(([n, title, desc]) => (
                  <li key={n} className="flex gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-bold text-white dark:bg-white dark:text-gray-900">{n}</span>
                    <div>
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</div>
                      <div className="text-xs text-gray-500">{desc}</div>
                    </div>
                  </li>
                ))}
              </ol>
              {txNote && <p className="mt-3 text-xs text-gray-500">🔄 {txNote}</p>}
            </section>

            {/* Barème */}
            {baremeRows.length > 0 && (
              <section className="mt-8">
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">{t('bareme')}</h2>
                <p className="mb-3 text-xs text-gray-400">{t('baremeSub')}</p>
                {season?.starsEnabled && (
                  <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/10 dark:text-amber-300">{t('starsNote')}</p>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {([[t('skaters'), skaterRules], ...(rg > 0 ? [[t('goalies'), goalieRules]] : [])] as [string, typeof skaterRules][]).map(([title, list]) => (
                    <div key={title} className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:bg-[#252525] dark:text-gray-200">{title}</div>
                      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                        {list.map((c) => (
                          <li key={c.key} className="flex items-center justify-between px-3 py-1.5 text-sm">
                            <span className="text-gray-700 dark:text-gray-300">{tScoring(c.key)}</span>
                            <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtCoef(c.coef)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  {season && season.rosterTeams > 0 && (
                    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:bg-[#252525] dark:text-gray-200">{t('teamNightly')}</div>
                      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                        <li className="flex items-center justify-between px-3 py-1.5 text-sm">
                          <span className="text-gray-700 dark:text-gray-300">{t('basePoints')}</span>
                          <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtNum(season.teamBasePoints, locale, 2)}</span>
                        </li>
                        {season.teamGfCoef !== 0 && (
                          <li className="flex items-center justify-between px-3 py-1.5 text-sm">
                            <span className="text-gray-700 dark:text-gray-300">{t('perGoalFor')}</span>
                            <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtCoef(season.teamGfCoef)}</span>
                          </li>
                        )}
                        {season.teamGaCoef !== 0 && (
                          <li className="flex items-center justify-between px-3 py-1.5 text-sm">
                            <span className="text-gray-700 dark:text-gray-300">{t('perGoalAgainst')}</span>
                            <span className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtCoef(season.teamGaCoef)}</span>
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            )}
    </PoolShell>
  );
}
