// Shared, server-safe configuration for the two "return confidence" meters
// (Nordiquomètre / Exposmètre). Single source of truth for the live component
// (ReturnMeter) AND the social share card (meter opengraph-image), so the two
// never drift.

export type MeterKey = 'nordiquometre' | 'exposmetre';

export interface MeterConfig {
  name: string;        // FR display name — also used in the bot message + reset
  nameEn: string;
  prep: string;        // grammatical preposition for "a voté <prep> <name>"
  image: string;       // dial gauge image
  needleColor: string; // needle fill
  gradientFrom: string; // social card background gradient
  gradientTo: string;
  geometry: { pivotX: number; pivotY: number; needleLength: number; angleMin: number; angleMax: number };
  verdict: (pct: number) => { text: string; emoji: string };
  announceSlugs: string[];
}

export const METER_CONFIGS: Record<MeterKey, MeterConfig> = {
  nordiquometre: {
    name: 'Nordiquomètre',
    nameEn: 'Nordiquometer',
    prep: 'au',
    image: '/images/nordiquometre.png',
    needleColor: '#003E7E',
    gradientFrom: '#001A40',
    gradientTo: '#003E7E',
    geometry: { pivotX: 40, pivotY: 48.5, needleLength: 25, angleMin: 10, angleMax: 360 },
    announceSlugs: ['nordiques-de-quebec', 'nordiques-quebec', 'la-taverne'],
    verdict: (pct) => {
      if (pct <= 5) return { text: "C'est mort. Oubliez ça.", emoji: '💀' };
      if (pct <= 15) return { text: 'Aucun signe de vie. Zéro espoir.', emoji: '🪦' };
      if (pct <= 25) return { text: "Faudrait un miracle. Pis les miracles, c'est rare.", emoji: '😔' };
      if (pct <= 35) return { text: "Y'a un pouls, mais c'est faible en maudit.", emoji: '💔' };
      if (pct <= 45) return { text: "On commence à jaser, mais c'est encore loin.", emoji: '🤔' };
      if (pct <= 55) return { text: 'Fifty-fifty. Ça pourrait aller des deux bords.', emoji: '⚖️' };
      if (pct <= 65) return { text: "Ça bouge. Y'a de l'espoir dans l'air.", emoji: '👀' };
      if (pct <= 75) return { text: "Les rumeurs sont fortes. Ça s'enligne bien.", emoji: '🔥' };
      if (pct <= 85) return { text: 'Presque confirmé. On retient notre souffle.', emoji: '😤' };
      if (pct <= 95) return { text: "C'est quasiment fait. Manque juste l'annonce.", emoji: '🚨' };
      return { text: 'LES NORDIQUES SONT DE RETOUR !', emoji: '🏒' };
    },
  },
  exposmetre: {
    name: 'Exposmètre',
    nameEn: 'Exposmeter',
    prep: "à l'",
    image: '/images/exposmetre.png',
    needleColor: '#0B4870',
    gradientFrom: '#001A40',
    gradientTo: '#0B4870',
    geometry: { pivotX: 50, pivotY: 50, needleLength: 30, angleMin: 20, angleMax: 340 },
    announceSlugs: ['expos-de-montreal', 'expos-montreal', 'la-taverne'],
    verdict: (pct) => {
      if (pct <= 5) return { text: "Le baseball à Montréal, c'est fini. Oubliez ça.", emoji: '💀' };
      if (pct <= 15) return { text: 'Aucun signe de vie. La MLB regarde ailleurs.', emoji: '🪦' };
      if (pct <= 25) return { text: 'Faudrait un miracle. Pis un stade.', emoji: '😔' };
      if (pct <= 35) return { text: "Y'a un pouls. Des investisseurs jasent.", emoji: '💔' };
      if (pct <= 45) return { text: 'On commence à y croire, mais la route est longue.', emoji: '🤔' };
      if (pct <= 55) return { text: 'Fifty-fifty. Manfred écoute, mais rien de concret.', emoji: '⚖️' };
      if (pct <= 65) return { text: 'Ça bouge sérieusement. Le dossier avance.', emoji: '👀' };
      if (pct <= 75) return { text: 'Les investisseurs sont là. Le stade se dessine.', emoji: '🔥' };
      if (pct <= 85) return { text: 'Presque confirmé. Montréal est dans la course.', emoji: '😤' };
      if (pct <= 95) return { text: "C'est quasiment fait. L'expansion arrive.", emoji: '🚨' };
      return { text: 'NOS AMOURS SONT DE RETOUR !', emoji: '⚾' };
    },
  },
};
