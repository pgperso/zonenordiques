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

const category = s(process.env.NEXT_PUBLIC_SITE_CATEGORY, 'hockey');

/**
 * The hockey brand is the one this codebase grew out of, so every feature
 * below exists for it. Defaulting the feature flags to `true` therefore made
 * a MISSING variable mean "behave like Zone Nordiques" — the CFL deployment
 * would have rendered the Nordiquomètre for real and written football fans'
 * votes into the hockey table, with no error anywhere.
 *
 * Deriving the default from the category instead makes the absence of config
 * safe: an unrecognised sport gets nothing rather than getting hockey. A
 * brand that does have one of these still opts in explicitly.
 */
const isHockey = category === 'hockey';

export const SITE = {
  // User-facing sport word, e.g. 'hockey' | 'baseball'.
  sport: s(process.env.NEXT_PUBLIC_SITE_SPORT, 'hockey'),
  // The sport CATEGORY this brand owns (matches a row in `categories.slug`,
  // e.g. 'hockey' | 'baseball'). Every public content surface is scoped to the
  // communities in this category (plus La Taverne and the flagship tribune),
  // so a baseball brand never surfaces hockey content and vice-versa.
  category,
  // League label used in copy, e.g. 'LNH' | 'MLB'.
  league: s(process.env.NEXT_PUBLIC_SITE_LEAGUE, 'LNH'),
  // Which "return-confidence" meter is featured: 'nordiquometre' | 'exposmetre'.
  // The route is `/${meter}` and its votes live in `${meter}_votes`.
  meter: s(process.env.NEXT_PUBLIC_SITE_METER, 'nordiquometre'),
  // Display name of that meter (e.g. 'Nordiquomètre' | 'Exposmètre').
  meterLabel: s(process.env.NEXT_PUBLIC_SITE_METER_LABEL, 'Nordiquomètre'),
  // One-line meter tagline (per locale) for the gallery card.
  meterTagline: s(process.env.NEXT_PUBLIC_SITE_METER_TAGLINE, 'L’indice de confiance du retour des Nordiques'),
  meterTaglineEn: s(process.env.NEXT_PUBLIC_SITE_METER_TAGLINE_EN, 'The confidence index for the Nordiques’ return'),
  // Slug of the brand's flagship chat tribune (the "La Zone" shortcut).
  mainTribune: s(process.env.NEXT_PUBLIC_SITE_MAIN_TRIBUNE, 'zone-nordiques'),
  // Live scoreboard strip. A scoreboard exists for hockey (NHL) and baseball
  // (MLB); a brand whose league has no free data feed (e.g. the CFL) turns this
  // off. The layout also refuses to fall back to another sport's board.
  // Scoreboards exist for hockey (NHL) and baseball (MLB) only; any other
  // sport has no free data feed, so it gets none unless it says otherwise.
  showScoreboard: flag(
    process.env.NEXT_PUBLIC_SITE_SCOREBOARD,
    isHockey || category === 'baseball',
  ),
  // Whether this brand features a "return-confidence" meter at all. A brand
  // without one (no `<meter>_votes` table) must hide every meter surface —
  // sidebar card, chat bar and sitemap entry.
  showMeter: flag(process.env.NEXT_PUBLIC_SITE_METER_ENABLED, isHockey),
  // Fantasy pool entry points (NHL-only today).
  showPool: flag(process.env.NEXT_PUBLIC_SITE_POOL, isHockey),
} as const;
