// Article text hygiene. A lot of imported/pasted content stored HTML entities
// as literal text (e.g. "amphithé&acirc;tre"), which React renders escaped so
// readers — and Google — see the raw "&acirc;". Decoding at the mapper layer
// makes every card, page and meta tag show clean text without touching the DB.

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', bull: '•', middot: '·',
  deg: '°', euro: '€', copy: '©', reg: '®', trade: '™',
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å',
  ccedil: 'ç', egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë',
  igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï', ntilde: 'ñ',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yuml: 'ÿ', szlig: 'ß',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Auml: 'Ä', Ccedil: 'Ç',
  Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Euml: 'Ë',
  Icirc: 'Î', Iuml: 'Ï', Ocirc: 'Ô', Ouml: 'Ö', Ugrave: 'Ù', Ucirc: 'Û', Uuml: 'Ü',
  oelig: 'œ', OElig: 'Œ', aelig: 'æ', AElig: 'Æ',
};

/** Decode HTML entities (named + numeric) stored as literal text. */
export function decodeEntities(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]+);/g, (m, name) => NAMED[name] ?? m);
}

function safeCodePoint(cp: number): string {
  try {
    return Number.isFinite(cp) && cp > 0 ? String.fromCodePoint(cp) : '';
  } catch {
    return '';
  }
}

/**
 * A clean, displayable title. Decodes entities; when the stored title is empty
 * or the literal string "NULL" (a bad import), derives one from the body.
 */
export function cleanArticleTitle(
  title: string | null | undefined,
  body: string | null | undefined,
  fallback: string,
): string {
  const t = decodeEntities(title).trim();
  if (t && t.toUpperCase() !== 'NULL') return t;
  // Derive from the body: decode, drop HTML tags and pasted URLs (a lot of
  // imported posts start with a raw link), then take the first real sentence.
  const text = decodeEntities(body)
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length >= 3) {
    const firstSentence = (text.match(/^.*?[.!?](?:\s|$)/)?.[0] ?? text).trim();
    const base = firstSentence.length >= 12 ? firstSentence : text;
    const clipped = base.length > 70 ? `${base.slice(0, 70).trimEnd()}…` : base;
    return clipped.replace(/[.!?]+$/, '');
  }
  return fallback;
}
