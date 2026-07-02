import type { Metadata } from 'next';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { getActiveSeason } from '@/services/poolService';
import { PoolShell } from '../../PoolShell';
import { fmtMoney, fmtPoints } from '@/components/pool/format';
import { BRAND } from '@/lib/brand';

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}): Promise<Metadata> {
  const { locale, id } = await params;
  const t = await getTranslations({ locale, namespace: 'pool.playerPage' });
  const supabase = await createClient();
  const db = supabase as unknown as SupabaseClient;
  const { data } = await db.from('nhl_players').select('full_name, team_abbrev').eq('player_id', Number(id)).maybeSingle();
  const p = data as { full_name: string; team_abbrev: string | null } | null;
  const name = p?.full_name ?? t('fallbackName');
  const brand = locale === 'fr' ? BRAND.name : BRAND.nameEn;
  const title = `${name}${p?.team_abbrev ? ` (${p.team_abbrev})` : ''} — ${t('metaTitle')} | ${brand}`;
  return {
    title,
    description: t('metaDesc', { name, brand }),
    alternates: { canonical: `${BRAND.url}/${locale}/lnh/pool/joueur/${id}` },
  };
}

export default async function PlayerPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('pool.playerPage');
  const playerId = Number(id);
  if (!Number.isFinite(playerId)) notFound();

  const supabase = await createClient();
  const db = supabase as unknown as SupabaseClient;

  const { data: playerData } = await db
    .from('nhl_players')
    .select('player_id, full_name, team_abbrev, position, sweater_number, headshot_url')
    .eq('player_id', playerId)
    .maybeSingle();
  if (!playerData) notFound();
  const player = playerData as {
    player_id: number; full_name: string; team_abbrev: string | null;
    position: string; sweater_number: number | null; headshot_url: string | null;
  };
  const isGoalie = player.position === 'G';

  const season = await getActiveSeason(supabase);
  const n = (v: unknown) => Number(v ?? 0);

  // Price (current season) + season stats + ownership.
  const [priceRes, statRes, ownedRes, totalRes] = await Promise.all([
    season ? db.from('pool_player_prices').select('price_cents, proj_points').eq('season_id', season.id).eq('player_id', playerId).maybeSingle() : Promise.resolve({ data: null }),
    season ? db.from('pool_player_season_stats').select('*').eq('pool_season_id', season.id).eq('player_id', playerId).maybeSingle() : Promise.resolve({ data: null }),
    season ? db.from('pool_roster_slots').select('id, pool_entries!inner(season_id)', { count: 'exact', head: true }).eq('player_id', playerId).is('effective_to', null).eq('pool_entries.season_id', season.id) : Promise.resolve({ count: 0 }),
    season ? db.from('pool_entries').select('id', { count: 'exact', head: true }).eq('season_id', season.id).gt('spent_cents', 0) : Promise.resolve({ count: 0 }),
  ]);
  const price = priceRes.data as { price_cents: number; proj_points: number } | null;
  const st = statRes.data as Record<string, number> | null;
  const owned = (ownedRes as { count: number | null }).count ?? 0;
  const totalTeams = (totalRes as { count: number | null }).count ?? 0;
  const ownPct = totalTeams > 0 ? Math.round((owned / totalTeams) * 100) : 0;

  const gp = n(st?.gp);
  const sv = isGoalie && n(st?.shots_against) > 0 ? (n(st?.saves) / n(st?.shots_against)).toFixed(3).replace(/^0/, '') : '—';
  const gaa = isGoalie && n(st?.toi_seconds) > 0 ? (n(st?.goals_against) / (n(st?.toi_seconds) / 3600)).toFixed(2) : '—';

  const skaterStats: [string, string | number][] = [
    [t('gp'), gp], [t('goals'), n(st?.goals)], [t('assists'), n(st?.assists)], [t('points'), n(st?.points)],
    [t('plusMinus'), n(st?.plus_minus)], [t('pim'), n(st?.pim)], [t('shots'), n(st?.shots)],
    [t('ppGoals'), n(st?.pp_goals)], [t('hits'), n(st?.hits)], [t('blocked'), n(st?.blocked_shots)],
  ];
  const goalieStats: [string, string | number][] = [
    [t('gp'), gp], [t('wins'), n(st?.wins)], [t('losses'), n(st?.losses)], [t('otLosses'), n(st?.ot_losses)],
    [t('gaa'), gaa], [t('svPct'), sv], [t('shutouts'), n(st?.shutouts)],
    [t('saves'), n(st?.saves)], [t('goalsAgainst'), n(st?.goals_against)],
  ];
  const stats = isGoalie ? goalieStats : skaterStats;

  const cards = [
    { l: t('price'), v: price ? fmtMoney(price.price_cents, locale) : '—' },
    { l: t('poolPoints'), v: st ? fmtPoints(n(st.fantasy_points), locale) : '0' },
    { l: t('ownedBy'), v: `${ownPct}%`, sub: totalTeams > 0 ? t('ownedTeams', { owned, total: totalTeams }) : undefined },
  ];

  return (
    <PoolShell>
      <div className="flex items-center gap-4">
        {player.headshot_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={player.headshot_url} alt="" className="h-16 w-16 rounded-full bg-gray-100 object-cover dark:bg-[#252525]" />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-xl font-bold text-gray-400 dark:bg-[#252525]">
            {player.full_name[0]}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{player.full_name}</h1>
          <p className="text-sm text-gray-500">
            {player.team_abbrev ?? '—'} · {t.has(`pos.${player.position}`) ? t(`pos.${player.position}`) : player.position}
            {player.sweater_number ? ` · #${player.sweater_number}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.l} className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
            <div className="text-xs uppercase tracking-wide text-gray-500">{c.l}</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">{c.v}</div>
            {c.sub && <div className="text-[11px] text-gray-400">{c.sub}</div>}
          </div>
        ))}
      </div>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{t('seasonStats')}</h2>
        {gp === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700">
            {t('noStats')}
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200 sm:grid-cols-3 dark:border-gray-700 dark:bg-gray-700">
            {stats.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between bg-white px-3 py-2 dark:bg-[#1e1e1e]">
                <dt className="text-sm text-gray-600 dark:text-gray-300">{label}</dt>
                <dd className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </PoolShell>
  );
}
