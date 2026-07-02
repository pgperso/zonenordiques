/**
 * Resolve which language version of a piece of editorial content to show.
 *
 * Articles and podcasts are written in one language (`source_lang`) and
 * machine-translated once into the other (the `*_translated` columns,
 * filled by /api/translate-pending). When the viewer's locale differs
 * from the source language and a translation exists, show it; otherwise
 * fall back to the original.
 */
export function translatedField<T extends string | null>(
  sourceLang: string | null,
  locale: string,
  original: T,
  translated: string | null,
): T {
  if ((sourceLang ?? 'fr') !== locale && translated != null && translated !== '') {
    return translated as T;
  }
  return original;
}
