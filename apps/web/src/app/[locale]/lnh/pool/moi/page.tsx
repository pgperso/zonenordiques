import type { Metadata } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveSeason, getStandings, getRosterWithStats, getTeamChoices, type NhlTeamChoice } from '@/services/poolService';
import { PoolShell } from '../PoolShell';
import { PoolRosterStats } from '@/components/pool/PoolRosterStats';
import { TeamGoalies } from '@/components/pool/TeamGoalies';
import { TeamIdentityEditor } from './TeamIdentityEditor';
import { fmtMoney, fmtPoints, fmtNum } from '@/components/pool/format';
import { TeamLogo } from '@/components/pool/TeamLogo';
import { BRAND } from '@/lib/brand';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const title = locale === 'fr' ? `Mon équipe | ${BRAND.name}` : `My team | ${BRAND.nameEn}`;
  return { title, robots: { index: false, follow: false } };
}

export default async function MyTeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('pool.myTeamPage');
  const tRoster = await getTranslations('pool.roster');
  const tPool = await getTranslations('pool');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?redirect=/lnh/pool/moi');

  const season = await getActiveSeason(supabase);
  if (!season) redirect('/lnh/pool');
  const db = supabase as unknown as SupabaseClient;

  const { data: entryData } = await db
    .from('pool_entries')
    .select('id, team_name, team_logo, is_locked, spent_cents, transactions_used, team_pick')
    .eq('season_id', season.id)
    .eq('member_id', user.id)
    .maybeSingle();
  const entry = entryData as { id: number; team_name: string; team_logo: string | null; is_locked: boolean; spent_cents: number; transactions_used: number; team_pick: string | null } | null;
  if (!entry) redirect('/lnh/pool/composer');

  let teamPickInfo: NhlTeamChoice | null = null;
  if (entry.team_pick && season.rosterTeams > 0) {
    const teams = await getTeamChoices(supabase, season.id);
    teamPickInfo = teams.find((t) => t.abbrev === entry.team_pick) ?? null;
  }

  const draftClosed = Boolean(season.lockAt && new Date(season.lockAt) <= new Date());

  const [rows, standings] = await Promise.all([
    getRosterWithStats(supabase, season.id, entry.id),
    getStandings(supabase, season.id),
  ]);
  const standing = standings.find((s) => s.entryId === entry.id);

  return (
    <PoolShell>
      {/* Narrow track for text/header/cards */}
      <div>
        <div className="flex items-center gap-3">
          <TeamLogo logo={entry.team_logo} name={entry.team_name} size={44} />
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{entry.team_name}</h1>
            <p className="text-sm text-gray-500">{season.name}{draftClosed ? ` · ${t('draftClosedSuffix')}` : ` · ${t('editableSuffix')}`}</p>
          </div>
        </div>

        <section className="mt-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{t('identityTitle')}</h2>
          <TeamIdentityEditor entryId={entry.id} memberId={user.id} initialName={entry.team_name} initialLogo={entry.team_logo} />
        </section>
      </div>

      {/* Stat cards — span the full width of the wide track */}
      <div className={`mt-4 grid grid-cols-2 gap-3 ${season.transactionsEnabled ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
        {[
          { l: t('cardRank'), v: standing?.rank ? (locale === 'fr' ? `${standing.rank}ᵉ` : `#${standing.rank}`) : '—' },
          { l: t('cardPoints'), v: standing ? fmtPoints(standing.fantasyPoints, locale) : '0' },
          { l: t('cardCap'), v: fmtMoney(entry.spent_cents, locale) },
          ...(season.transactionsEnabled
            ? [{ l: t('cardTrades'), v: String(Math.max(0, season.maxTransactions - entry.transactions_used)) }]
            : []),
        ].map((s) => (
          <div key={s.l} className="rounded-lg border border-gray-200 p-4 text-center dark:border-gray-700">
            <div className="text-xs uppercase tracking-wide text-gray-500">{s.l}</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{s.v}</div>
          </div>
        ))}
      </div>

      {(!standing || standing.gamesCounted === 0) && (
        <p className="mt-2 text-xs text-gray-400">{t('seasonNotStarted')}</p>
      )}

      {/* Wide track: header row + rich stat tables */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t('myLineup')}</h2>
        {!draftClosed && (
          <Link href="/lnh/pool/composer" className="rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-gray-900">
            {t('editLineup')}
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          {t('emptyLineup')} <Link href="/lnh/pool/composer" className="underline">{t('composeIt')}</Link>
        </div>
      ) : (
        <PoolRosterStats rows={rows} />
      )}

      {season.rosterTeams > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{t('teamNhl')}</h2>
          {teamPickInfo ? (
            <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{teamPickInfo.name}</span>
                <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtMoney(teamPickInfo.priceCents, locale)}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
                {[
                  { l: t('statGp'), v: teamPickInfo.gp },
                  { l: t('statW'), v: teamPickInfo.wins },
                  { l: t('statL'), v: teamPickInfo.losses },
                  { l: t('statFor'), v: teamPickInfo.gf },
                  { l: t('statAgainst'), v: teamPickInfo.ga },
                  { l: t('statPoolPts'), v: teamPickInfo.teamPoints },
                ].map((s) => (
                  <div key={s.l}>
                    <div className="text-xs uppercase tracking-wide text-gray-500">{s.l}</div>
                    <div className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                      {fmtNum(s.v, locale, 0)}
                    </div>
                  </div>
                ))}
              </div>
              <TeamGoalies goalies={teamPickInfo.goalies} locale={locale} t={(k) => tRoster(k)} title={tPool('goaliesTitle')} />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700">
              {t('noTeamChosen')} <Link href="/lnh/pool/composer" className="underline">{t('chooseOne')}</Link>
            </div>
          )}
        </section>
      )}
    </PoolShell>
  );
}
