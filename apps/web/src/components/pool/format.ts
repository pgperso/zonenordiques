// Locale-aware formatting for pool money + points. FR shows "100,0 M$",
// EN shows "$100.0M" — same magnitude, localized grouping and currency glyph.
const M = 100_000_000;

function intlLocale(locale: string): string {
  return locale === 'fr' ? 'fr-CA' : 'en-CA';
}

/** Cap value in cents → localized millions string. */
export function fmtMoney(cents: number, locale: string): string {
  const num = (cents / M).toLocaleString(intlLocale(locale), { maximumFractionDigits: 1 });
  return locale === 'fr' ? `${num} M$` : `$${num}M`;
}

/** Pool/fantasy points → localized 1-decimal string. */
export function fmtPoints(n: number, locale: string): string {
  return n.toLocaleString(intlLocale(locale), { maximumFractionDigits: 1 });
}

/** Plain localized number (0 decimals by default). */
export function fmtNum(n: number, locale: string, maximumFractionDigits = 0): string {
  return n.toLocaleString(intlLocale(locale), { maximumFractionDigits });
}
