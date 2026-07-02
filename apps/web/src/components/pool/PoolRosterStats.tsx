import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import type { RosterPlayerStats, PoolPosition } from '@/services/poolService';
import { fmtMoney, fmtPoints } from './format';

const M = 100_000_000;
// A star player's pool points count double.
const starPts = (p: RosterPlayerStats) => p.fantasyPoints * (p.isStar ? 2 : 1);
const svPct = (saves: number, sa: number) => (sa > 0 ? (saves / sa).toFixed(3).replace(/^0/, '') : '—');
const gaa = (ga: number, sec: number) => (sec > 0 ? (ga / (sec / 3600)).toFixed(2) : '—');

// Tailwind helpers shared by both tables.
const wrap = 'overflow-x-auto overscroll-x-contain rounded-lg border border-gray-200 dark:border-gray-700';
const thBase = 'px-3 py-2 text-right font-medium whitespace-nowrap';
const tdNum = 'px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-300';
const stickyTh = 'sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-medium dark:bg-[#252525]';
const stickyTd =
  'sticky left-0 z-10 bg-white px-3 py-2 text-left font-medium text-gray-900 group-hover:bg-gray-50 dark:bg-[#1e1e1e] dark:text-gray-100 dark:group-hover:bg-[#252525]';
const ptsTd = 'px-3 py-2 text-right font-bold tabular-nums text-gray-900 dark:text-gray-100';

type Badge = 'best' | 'worst' | null;
type T = Awaited<ReturnType<typeof getTranslations<'pool.roster'>>>;

function PlayerName({ p, badge, t }: { p: RosterPlayerStats; badge: Badge; t: T }) {
  return (
    <span className="block">
      <span className="flex items-center gap-1.5">
        <Link href={`/lnh/pool/joueur/${p.playerId}`} className="truncate hover:underline">{p.fullName}</Link>
        {p.isStar && (
          <span className="whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{t('star')}</span>
        )}
        {badge === 'best' && (
          <span className="whitespace-nowrap rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-900/40 dark:text-green-300">{t('bargain')}</span>
        )}
        {badge === 'worst' && (
          <span className="whitespace-nowrap rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">{t('flop')}</span>
        )}
      </span>
      <span className="text-xs font-normal text-gray-400">{p.teamAbbrev ?? '—'}</span>
    </span>
  );
}

function SkaterTable({ rows, badgeOf, t, locale }: { rows: RosterPlayerStats[]; badgeOf: (id: number) => Badge; t: T; locale: string }) {
  const sum = (k: keyof RosterPlayerStats) => rows.reduce((a, r) => a + (r[k] as number), 0);
  const totalPts = rows.reduce((a, r) => a + starPts(r), 0);
  return (
    <div className={wrap}>
      <table className="w-full min-w-[680px] text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-[#252525]">
          <tr>
            <th className={stickyTh}>{t('player')}</th>
            <th className={`${thBase} text-right`} title={t('ttPts')}>{t('pts')}</th>
            <th className={`${thBase} hidden md:table-cell`} title={t('ttGp')}>{t('gp')}</th>
            <th className={`${thBase} hidden sm:table-cell`} title={t('ttG')}>{t('g')}</th>
            <th className={`${thBase} hidden sm:table-cell`} title={t('ttA')}>{t('a')}</th>
            <th className={`${thBase} hidden md:table-cell`} title={t('ttTotPts')}>{t('totPts')}</th>
            <th className={`${thBase} hidden md:table-cell`} title={t('ttPlusMinus')}>{t('plusMinus')}</th>
            <th className={`${thBase} hidden lg:table-cell`} title={t('ttPun')}>{t('pun')}</th>
            <th className={`${thBase} hidden lg:table-cell`} title={t('ttShots')}>{t('shots')}</th>
            <th className={`${thBase} hidden lg:table-cell`} title={t('ttBan')}>{t('ban')}</th>
            <th className={`${thBase}`}>{t('salary')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((p) => (
            <tr key={p.playerId} className="group hover:bg-gray-50 dark:hover:bg-[#252525]">
              <td className={stickyTd}><PlayerName p={p} badge={badgeOf(p.playerId)} t={t} /></td>
              <td className={ptsTd}>{fmtPoints(starPts(p), locale)}</td>
              <td className={`${tdNum} hidden md:table-cell`}>{p.gp}</td>
              <td className={`${tdNum} hidden sm:table-cell`}>{p.goals}</td>
              <td className={`${tdNum} hidden sm:table-cell`}>{p.assists}</td>
              <td className={`${tdNum} hidden md:table-cell`}>{p.points}</td>
              <td className={`${tdNum} hidden md:table-cell`}>{p.plusMinus > 0 ? `+${p.plusMinus}` : p.plusMinus}</td>
              <td className={`${tdNum} hidden lg:table-cell`}>{p.pim}</td>
              <td className={`${tdNum} hidden lg:table-cell`}>{p.shots}</td>
              <td className={`${tdNum} hidden lg:table-cell`}>{p.ppGoals}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtMoney(p.priceCents, locale)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-gray-200 bg-gray-50 text-xs dark:border-gray-700 dark:bg-[#252525]">
          <tr>
            <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2 font-semibold text-gray-700 dark:bg-[#252525] dark:text-gray-200">{t('total')}</td>
            <td className="px-3 py-2 text-right font-bold tabular-nums text-gray-900 dark:text-gray-100">{fmtPoints(totalPts, locale)}</td>
            <td className="hidden px-3 py-2 md:table-cell"></td>
            <td className="hidden px-3 py-2 text-right tabular-nums text-gray-500 sm:table-cell">{sum('goals')}</td>
            <td className="hidden px-3 py-2 text-right tabular-nums text-gray-500 sm:table-cell">{sum('assists')}</td>
            <td className="hidden px-3 py-2 text-right tabular-nums text-gray-500 md:table-cell">{sum('points')}</td>
            <td className="hidden px-3 py-2 md:table-cell"></td>
            <td className="hidden px-3 py-2 lg:table-cell"></td>
            <td className="hidden px-3 py-2 lg:table-cell"></td>
            <td className="hidden px-3 py-2 lg:table-cell"></td>
            <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-700 dark:text-gray-200">{fmtMoney(sum('priceCents'), locale)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function GoalieTable({ rows, badgeOf, t, locale }: { rows: RosterPlayerStats[]; badgeOf: (id: number) => Badge; t: T; locale: string }) {
  return (
    <div className={wrap}>
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-[#252525]">
          <tr>
            <th className={stickyTh}>{t('goalie')}</th>
            <th className={`${thBase}`} title={t('ttPts')}>{t('pts')}</th>
            <th className={`${thBase} hidden md:table-cell`} title={t('ttGp')}>{t('gp')}</th>
            <th className={`${thBase} hidden sm:table-cell`} title={t('ttW')}>{t('w')}</th>
            <th className={`${thBase} hidden sm:table-cell`} title={t('ttL')}>{t('l')}</th>
            <th className={`${thBase} hidden lg:table-cell`} title={t('ttOtl')}>{t('otl')}</th>
            <th className={`${thBase} hidden md:table-cell`} title={t('ttGaa')}>{t('gaa')}</th>
            <th className={`${thBase} hidden md:table-cell`} title={t('ttSvpct')}>{t('svpct')}</th>
            <th className={`${thBase} hidden lg:table-cell`} title={t('ttSo')}>{t('so')}</th>
            <th className={`${thBase}`}>{t('salary')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((p) => (
            <tr key={p.playerId} className="group hover:bg-gray-50 dark:hover:bg-[#252525]">
              <td className={stickyTd}><PlayerName p={p} badge={badgeOf(p.playerId)} t={t} /></td>
              <td className={ptsTd}>{fmtPoints(starPts(p), locale)}</td>
              <td className={`${tdNum} hidden md:table-cell`}>{p.gp}</td>
              <td className={`${tdNum} hidden sm:table-cell`}>{p.wins}</td>
              <td className={`${tdNum} hidden sm:table-cell`}>{p.losses}</td>
              <td className={`${tdNum} hidden lg:table-cell`}>{p.otLosses}</td>
              <td className={`${tdNum} hidden md:table-cell`}>{gaa(p.goalsAgainst, p.toiSeconds)}</td>
              <td className={`${tdNum} hidden md:table-cell`}>{svPct(p.saves, p.shotsAgainst)}</td>
              <td className={`${tdNum} hidden lg:table-cell`}>{p.shutouts}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtMoney(p.priceCents, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Renders the full roster as rich stat tables, grouped F / D / G. */
export async function PoolRosterStats({ rows }: { rows: RosterPlayerStats[] }) {
  const [t, tPos, locale] = await Promise.all([
    getTranslations('pool.roster'),
    getTranslations('pool.positions'),
    getLocale(),
  ]);
  const f = rows.filter((r) => r.slotPosition === 'F');
  const d = rows.filter((r) => r.slotPosition === 'D');
  const g = rows.filter((r) => r.slotPosition === 'G');

  // Best/worst pick = highest/lowest value (pool points per $). Only once some
  // points exist — pre-season everyone is 0 and a badge would be meaningless.
  let bestId: number | null = null;
  let worstId: number | null = null;
  if (rows.some((r) => r.fantasyPoints > 0)) {
    const val = (r: RosterPlayerStats) => (r.priceCents > 0 ? r.fantasyPoints / (r.priceCents / M) : 0);
    const sorted = [...rows].sort((a, b) => val(b) - val(a));
    bestId = sorted[0].playerId;
    worstId = sorted[sorted.length - 1].playerId;
  }
  const badgeOf = (id: number): Badge => (id === bestId ? 'best' : id === worstId ? 'worst' : null);

  const section = (pos: PoolPosition, list: RosterPlayerStats[]) =>
    list.length === 0 ? null : (
      <section key={pos} className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{tPos(pos)}</h2>
        {pos === 'G'
          ? <GoalieTable rows={list} badgeOf={badgeOf} t={t} locale={locale} />
          : <SkaterTable rows={list} badgeOf={badgeOf} t={t} locale={locale} />}
      </section>
    );
  return (
    <>
      {section('F', f)}
      {section('D', d)}
      {section('G', g)}
    </>
  );
}
