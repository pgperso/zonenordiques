/**
 * Per-deployment sport/site configuration, env-driven so the same codebase runs
 * as a hockey site (Zone Nordiques) or a baseball site (Zone Expos) without a
 * fork. Defaults reproduce the current Zone Nordiques behaviour.
 *
 * Next only inlines NEXT_PUBLIC_* referenced as literal text, so spell each out.
 */

function s(value: string | undefined, fallback: string): string {
  return value && value.trim() ? value.trim() : fallback;
}

/** Boolean env flag: anything but "false"/"0" (and non-empty) is true. */
function flag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  const v = value.trim().toLowerCase();
  return v !== 'false' && v !== '0' && v !== 'no';
}

export const SITE = {
  // User-facing sport word, e.g. 'hockey' | 'baseball'.
  sport: s(process.env.NEXT_PUBLIC_SITE_SPORT, 'hockey'),
  // League label used in copy, e.g. 'LNH' | 'MLB'.
  league: s(process.env.NEXT_PUBLIC_SITE_LEAGUE, 'LNH'),
  // Which "return-confidence" meter is featured: 'nordiquometre' | 'exposmetre'.
  meter: s(process.env.NEXT_PUBLIC_SITE_METER, 'nordiquometre'),
  // Live scoreboard strip. Only an NHL scoreboard exists today, so a non-hockey
  // brand hides it until its league's version is built.
  showScoreboard: flag(process.env.NEXT_PUBLIC_SITE_SCOREBOARD, true),
  // Fantasy pool entry points (NHL-only today).
  showPool: flag(process.env.NEXT_PUBLIC_SITE_POOL, true),
} as const;
