import type { Metadata } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveSeason, getStandings, getRosterWithStats, getTeamChoices, type NhlTeamChoice } from '@/services/poolService';
import { PoolShell } from '../../PoolShell';
import { PoolRosterStats } from '@/components/pool/PoolRosterStats';
import { TeamGoalies } from '@/components/pool/TeamGoalies';
import { TeamLogo } from '@/components/pool/TeamLogo';
import { fmtMoney, fmtPoints } from '@/components/pool/format';
import { BRAND } from '@/lib/brand';

export const revalidate = 120;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'pool.teamPage' });
  const supabase = await createClient();
  const db = supabase as unknown as SupabaseClient;
  const { data } = await db.from('pool_entries').select('team_name').eq('id', Number(id)).maybeSingle();
  const name = (data as { team_name: string } | null)?.team_name ?? t('fallbackName');
  const title = `${name} — ${locale === 'fr' ? 'Pool LNH' : 'NHL Pool'} | ${locale === 'fr' ? BRAND.name : BRAND.nameEn}`;
  return { title, alternates: { canonical: `${BRAND.url}/${locale}/lnh/pool/equipe/${id}` } };
}

export default async function TeamPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('pool.teamPage');
  const tMy = await getTranslations('pool.myTeamPage');
  const tPool = await getTranslations('pool');
  const tRoster = await getTranslations('pool.roster');
  const entryId = Number(id);
  if (!Number.isFinite(entryId)) notFound();

  const supabase = await createClient();
  const db = supabase as unknown as SupabaseClient;

  const { data: entryData } = await db
    .from('pool_entries')
    .select('id, season_id, team_name, team_logo, member_id, spent_cents, team_pick, members(username, avatar_url)')
    .eq('id', entryId)
    .maybeSingle();
  if (!entryData) notFound();
  type MemberEmbed = { username: string | null; avatar_url: string | null };
  const entry = entryData as unknown as {
    id: number; season_id: number; team_name: string; team_logo: string | null;
    spent_cents: number; team_pick: string | null; members: MemberEmbed | MemberEmbed[] | null;
  };
  const owner = Array.isArray(entry.members) ? entry.members[0] : entry.members;

  const season = await getActiveSeason(supabase);
  const [rows, standings, teamChoices] = await Promise.all([
    season ? getRosterWithStats(supabase, season.id, entryId) : Promise.resolve([]),
    season ? getStandings(supabase, season.id) : Promise.resolve([]),
    season && season.rosterTeams > 0 && entry.team_pick ? getTeamChoices(supabase, season.id) : Promise.resolve([] as NhlTeamChoice[]),
  ]);
  const standing = standings.find((s) => s.entryId === entryId);
  const teamPickInfo = entry.team_pick ? teamChoices.find((c) => c.abbrev === entry.team_pick) ?? null : null;

  return (
    <PoolShell>
      <Link href="/lnh/pool/classement" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200">
        ← {tPool('standings')}
      </Link>
      <div>
        <div className="flex items-center gap-3">
          <TeamLogo logo={entry.team_logo} name={entry.team_name} size={44} />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{entry.team_name}</h1>
            {owner?.username && (
              <Link href={`/auteurs/${owner.username}`} className="flex items-center gap-1.5 text-sm text-gray-500 hover:underline">
                {owner.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={owner.avatar_url} alt="" className="h-4 w-4 rounded-full object-cover" />
                )}
                @{owner.username}
              </Link>
            )}
          </div>
        </div>

      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { l: t('rank'), v: standing?.rank ? (locale === 'fr' ? `${standing.rank}ᵉ` : `#${standing.rank}`) : '—' },
          { l: t('points'), v: standing ? fmtPoints(standing.fantasyPoints, locale) : '0' },
          { l: t('capUsed'), v: fmtMoney(entry.spent_cents, locale) },
        ].map((s) => (
          <div key={s.l} className="rounded-lg border border-gray-200 p-4 text-center dark:border-gray-700">
            <div className="text-xs uppercase tracking-wide text-gray-500">{s.l}</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{s.v}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          {t('noRoster')}
        </div>
      ) : (
        <PoolRosterStats rows={rows} />
      )}

      {teamPickInfo && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{tMy('teamNhl')}</h2>
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{teamPickInfo.name}</span>
              <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtMoney(teamPickInfo.priceCents, locale)}</span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
              {[
                { l: tMy('statGp'), v: teamPickInfo.gp },
                { l: tMy('statW'), v: teamPickInfo.wins },
                { l: tMy('statL'), v: teamPickInfo.losses },
                { l: tMy('statFor'), v: teamPickInfo.gf },
                { l: tMy('statAgainst'), v: teamPickInfo.ga },
                { l: tMy('statPoolPts'), v: teamPickInfo.teamPoints },
              ].map((s) => (
                <div key={s.l}>
                  <div className="text-xs uppercase tracking-wide text-gray-500">{s.l}</div>
                  <div className="text-sm font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {s.v.toLocaleString(locale === 'fr' ? 'fr-CA' : 'en-CA', { maximumFractionDigits: 0 })}
                  </div>
                </div>
              ))}
            </div>
            <TeamGoalies goalies={teamPickInfo.goalies} locale={locale} t={(k) => tRoster(k)} title={tPool('goaliesTitle')} />
          </div>
        </section>
      )}
    </PoolShell>
  );
}
