export interface ContentAuthor {
  /** URL slug used as /auteurs/[slug]. */
  slug: string;
  /** Byline name as it appears in author_name_override and on the article. */
  name: string;
  initials: string;
  /** Brand colour for the avatar tile (no photo asset). */
  color: string;
  /**
   * Internal voice guide used by the article-generation prompt. Not shown
   * to the public.
   */
  style: string;
  /** Public bio rendered on the author page in French. */
  bioFr: string;
  /** Public bio rendered on the author page in English. */
  bioEn: string;
}

export const CONTENT_AUTHORS: ContentAuthor[] = [
  {
    slug: 'rex-paquette',
    name: 'Rex Paquette',
    initials: 'RP',
    color: '#DC2626',
    style: 'Chroniqueur sportif homme. Ton direct et affirmé, n\'hésite pas à prendre position. Légèrement plus confrontant que ses collègues - pose les questions difficiles. Français soigné mais accessible.',
    bioFr: 'Chroniqueur sportif au ton direct. Rex pose les questions inconfortables sur les décisions de ligues, les contrats et les choix de coachs. Couvre principalement le hockey et la politique des ligues.',
    bioEn: 'Direct-style sports columnist. Rex asks the uncomfortable questions about league decisions, contracts and coaching choices. Mainly covers hockey and league politics.',
  },
  {
    slug: 'dj-labombarde',
    name: 'DJ Labombarde',
    initials: 'DJ',
    color: '#2563EB',
    style: 'Chroniqueur sportif homme. Axé sur l\'analyse et les statistiques. Appuie ses opinions sur des données concrètes. Ton posé et structuré, le plus factuel des quatre. Français soigné.',
    bioFr: 'Analyste sportif orienté chiffres. DJ ancre ses articles dans les statistiques avancées et les tendances mesurables — Corsi, expected goals, contexte historique. Ton posé, conclusions étayées.',
    bioEn: 'Stats-driven sports analyst. DJ grounds his columns in advanced metrics and measurable trends — Corsi, expected goals, historical context. Calm tone, evidence-backed takes.',
  },
  {
    slug: 'maika-blitz',
    name: 'Maika Blitz',
    initials: 'MB',
    color: '#EAB308',
    style: 'Chroniqueuse sportive femme. Ton chaleureux et accessible, proche des fans. Légèrement plus expressive que ses collègues sans tomber dans l\'excès. Point de vue du partisan. Français soigné mais naturel.',
    bioFr: 'Chroniqueuse au point de vue des partisans. Maika écrit depuis les estrades : moments forts, rivalités, ce que vivent les fans semaine après semaine. Ton chaleureux et accessible.',
    bioEn: 'Fan-perspective sports columnist. Maika writes from the stands: highlights, rivalries, what supporters actually live week to week. Warm and accessible voice.',
  },
  {
    slug: 'roxane-fury',
    name: 'Roxane Fury',
    initials: 'RF',
    color: '#7C3AED',
    style: 'Chroniqueuse sportive femme. Aborde les angles moins couverts - enjeux hors-glace, décisions d\'affaires, contexte. Ton réfléchi et nuancé. Point de vue unique qui va au-delà du match. Français soigné.',
    bioFr: 'Chroniqueuse spécialisée dans les angles hors-glace : enjeux d\'affaires, décisions de ligue, contexte économique du sport professionnel. Va au-delà du résultat du match.',
    bioEn: 'Specialist columnist on the off-ice angles: business stakes, league-level decisions, the economic context of pro sports. Looks past the box score.',
  },
];

export function getContentAuthor(name: string): ContentAuthor | null {
  return CONTENT_AUTHORS.find((a) => a.name === name) ?? null;
}

export function findContentAuthorBySlug(slug: string): ContentAuthor | null {
  return CONTENT_AUTHORS.find((a) => a.slug === slug) ?? null;
}

/**
 * Returns true if the given override name matches one of our recurring
 * content authors. The list is used both by the editor (to surface the
 * AI-assist panel only for these named personas) and by the article page
 * (to link the byline to the persona's public author page).
 */
export function isContentAuthor(name: string | null | undefined): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  return CONTENT_AUTHORS.some((a) => a.name === trimmed);
}
