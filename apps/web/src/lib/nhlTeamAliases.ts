/**
 * Normalize a team abbreviation to the code the NHL API uses.
 *
 * `nhl_players.team_abbrev` is written straight from api-web.nhle.com, which
 * uses a fixed set of three-letter codes. Salary and projection spreadsheets
 * do not: they abbreviate for column width, so the same club shows up as
 * "TB", "T.B.", "Tam" or "Tbl". An unrecognised code is not a cosmetic
 * problem — the importer's second matching pass is "last name + team", so a
 * mismatched abbreviation turns every shared surname into an unmatched row.
 *
 * Anything already a valid NHL code passes through untouched, and anything
 * unknown is returned upper-cased rather than dropped, so the caller can
 * report it instead of silently guessing.
 */

/** The 32 codes api-web.nhle.com emits. */
export const NHL_TEAM_CODES = new Set([
  'ANA', 'BOS', 'BUF', 'CAR', 'CBJ', 'CGY', 'CHI', 'COL', 'DAL', 'DET',
  'EDM', 'FLA', 'LAK', 'MIN', 'MTL', 'NJD', 'NSH', 'NYI', 'NYR', 'OTT',
  'PHI', 'PIT', 'SEA', 'SJS', 'STL', 'TBL', 'TOR', 'UTA', 'VAN', 'VGK',
  'WPG', 'WSH',
]);

/**
 * Alternate spellings → NHL code. Keys are upper-cased and stripped of
 * punctuation before lookup, so "T.B." and "tb" both land on "TB".
 */
const ALIASES: Record<string, string> = {
  // Two-letter forms common in spreadsheets
  TB: 'TBL', SJ: 'SJS', LA: 'LAK', NJ: 'NJD',
  // Three-letter forms that differ from the NHL's
  TAM: 'TBL', TAB: 'TBL', SAN: 'SJS', SJK: 'SJS',
  LOS: 'LAK', NJN: 'NJD', NJY: 'NJD',
  WIN: 'WPG', WPJ: 'WPG',
  CLS: 'CBJ', CLB: 'CBJ', CBS: 'CBJ',
  VEG: 'VGK', LV: 'VGK', LVK: 'VGK',
  WAS: 'WSH', WAP: 'WSH',
  MON: 'MTL', MON_: 'MTL',
  CAL: 'CGY',
  ANH: 'ANA',
  NAS: 'NSH',
  TOR_: 'TOR',
  // Utah has changed name twice; older files still carry the Arizona codes.
  ARI: 'UTA', PHX: 'UTA', UTH: 'UTA', UT: 'UTA',
  // Occasionally spelled out
  FLO: 'FLA', FL: 'FLA',
  COLO: 'COL',
  DETR: 'DET',
  MINN: 'MIN',
  BUFF: 'BUF',
  CARO: 'CAR',
  PITT: 'PIT',
  SEAT: 'SEA',
  VANC: 'VAN',
};

/**
 * `"Edm"` → `"EDM"`, `"TB"` → `"TBL"`, `"win"` → `"WPG"`.
 * Returns `''` for blank input, and the upper-cased original when the code
 * is not recognised — never a guess.
 */
export function normalizeTeamAbbrev(raw: string | null | undefined): string {
  if (!raw) return '';
  const key = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!key) return '';
  if (NHL_TEAM_CODES.has(key)) return key;
  return ALIASES[key] ?? key;
}

/** True when the abbreviation resolves to a real NHL club. */
export function isKnownTeamAbbrev(raw: string | null | undefined): boolean {
  return NHL_TEAM_CODES.has(normalizeTeamAbbrev(raw));
}
