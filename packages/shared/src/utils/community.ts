// Locale-aware display helpers for community names and descriptions.
//
// Most tribunes have the same name in French and English (proper nouns
// like "Canadiens de Montréal"). For those, `name_en` is NULL and we
// fall back to `name`. For leagues whose acronym differs across
// languages (LNH/NHL, LMB/MLB, LCF/CFL) the English form lives in
// `name_en` and we pick it when the locale is English.

export type CommunityLocale = 'fr' | 'en' | string;

export interface CommunityNameSource {
  name: string;
  name_en?: string | null;
}

export interface CommunityDescriptionSource {
  description: string | null;
  description_en?: string | null;
}

export function displayCommunityName(
  community: CommunityNameSource,
  locale: CommunityLocale,
): string {
  if (locale === 'en' && community.name_en) return community.name_en;
  return community.name;
}

export function displayCommunityDescription(
  community: CommunityDescriptionSource,
  locale: CommunityLocale,
): string | null {
  if (locale === 'en' && community.description_en) return community.description_en;
  return community.description;
}
