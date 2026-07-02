import type { TeamGoalie } from '@/services/poolService';
import { fmtMoney, fmtPoints } from './format';

const gaa = (ga: number, sec: number) => (sec > 0 ? (ga / (sec / 3600)).toFixed(2) : '—');
const svPct = (saves: number, sa: number) => (sa > 0 ? (saves / sa).toFixed(3).replace(/^0/, '') : '—');

/**
 * The two official goalies whose salaries make up the team price. Pure
 * presentational — labels come in via `t` (a roster-namespace translator) so
 * it works from both server and client callers.
 */
export function TeamGoalies({
  goalies, locale, t, title,
}: {
  goalies: TeamGoalie[];
  locale: string;
  t: (key: string) => string;
  title: string;
}) {
  if (goalies.length === 0) return null;
  const totalSalary = goalies.reduce((s, g) => s + g.priceCents, 0);
  const th = 'px-2 py-1.5 text-right font-medium whitespace-nowrap';
  const td = 'px-2 py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-300';

  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full min-w-[460px] text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-[#252525]">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium">{t('goalie')}</th>
              <th className={th} title={t('ttGp')}>{t('gp')}</th>
              <th className={th} title={t('ttW')}>{t('w')}</th>
              <th className={th} title={t('ttL')}>{t('l')}</th>
              <th className={th} title={t('ttGaa')}>{t('gaa')}</th>
              <th className={th} title={t('ttSvpct')}>{t('svpct')}</th>
              <th className={th} title={t('ttPts')}>{t('pts')}</th>
              <th className={th}>{t('salary')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {goalies.map((g) => (
              <tr key={g.playerId}>
                <td className="px-2 py-1.5 text-left font-medium text-gray-900 dark:text-gray-100">{g.fullName}</td>
                <td className={td}>{g.gp}</td>
                <td className={td}>{g.wins}</td>
                <td className={td}>{g.losses}</td>
                <td className={td}>{gaa(g.goalsAgainst, g.toiSeconds)}</td>
                <td className={td}>{svPct(g.saves, g.shotsAgainst)}</td>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums text-gray-900 dark:text-gray-100">{fmtPoints(g.fantasyPoints, locale)}</td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-gray-900 dark:text-gray-100">{fmtMoney(g.priceCents, locale)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-200 bg-gray-50 text-xs dark:border-gray-700 dark:bg-[#252525]">
            <tr>
              <td className="px-2 py-1.5 text-left font-semibold text-gray-700 dark:text-gray-200" colSpan={7}>{t('total')}</td>
              <td className="px-2 py-1.5 text-right font-bold tabular-nums text-gray-900 dark:text-gray-100">{fmtMoney(totalSalary, locale)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
