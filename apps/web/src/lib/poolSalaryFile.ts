/**
 * Reader for the pool's salary / projection spreadsheet.
 *
 * The file is produced by hand in Excel and exported to CSV, so the shape is
 * whatever the spreadsheet happened to look like. The real one looks like:
 *
 *   #,Nom,,Âge,Équ.,Pos,PJ,B,P,Pts,PPP,CapH
 *   1,Connor,McDavid,29,Edm,C,82,44,91,135,1.65,12.50
 *
 * Three things in there will silently corrupt an import if taken literally:
 *
 *  1. The player's name spans TWO columns — "Nom" holds the first name and
 *     the surname sits in a column with an empty header.
 *  2. "CapH" is in MILLIONS. Read as dollars, every salary in the pool would
 *     be off by a factor of a million, and nothing would complain: 12.50
 *     is a perfectly valid amount.
 *  3. The team codes are not the NHL's (TB, SJ, Win, LA), which breaks the
 *     "surname + team" matching pass.
 *
 * So the reader detects the layout rather than assuming it, and reports what
 * it decided so the operator can confirm before anything is written.
 */
import { normalizeTeamAbbrev, isKnownTeamAbbrev } from '@/lib/nhlTeamAliases';

export interface SalaryFileRow {
  /** Full name, first + last, however the file split it. */
  name: string;
  /** Team abbreviation normalized to the NHL's code. */
  team: string;
  /** The team code exactly as it appeared, for the report. */
  teamRaw: string;
  /** Salary in cents, already scaled by the detected unit. */
  capHitCents: number | null;
  /** The salary cell exactly as it appeared. Kept so a row the reader had to
   *  reject can show WHAT it rejected — an empty cell, an em-dash and a typo
   *  are three different things to fix in the spreadsheet. */
  capHitRaw: string;
  /** Position as written in the file (C/LW/RW/D/G), when present. */
  position: string | null;
  /** Projected points, when the file carries a projection column. */
  projPoints: number | null;
  /** 1-based line number in the file, for error messages. */
  line: number;
}

export type CapUnit = 'millions' | 'dollars' | 'unknown';

export interface SalaryFileLayout {
  /** Whether the name came from one column or two. */
  nameColumns: 'single' | 'split';
  /** Header text the reader matched, so the operator can see it guessed right. */
  nameHeader: string;
  teamHeader: string;
  capHeader: string;
  positionHeader: string | null;
  projHeader: string | null;
  /** How the salary column was interpreted, and why. */
  capUnit: CapUnit;
  capUnitReason: string;
}

export interface SalaryFileParse {
  /** Columns the reader could not find at all. */
  missingColumns: string[];
  rows: SalaryFileRow[];
  layout: SalaryFileLayout;
  /** Lines skipped as blank or separator rows, with their numbers. */
  skippedLines: number[];
  /** Team codes that resolve to no NHL club. */
  unknownTeams: string[];
}

/**
 * Quote-aware split of one CSV line.
 *
 * A French-locale Excel writes ';' rather than ',', which used to collapse
 * every line into a single cell — the reader then reported 'aucune colonne de
 * nom trouvée', naming neither the cause nor the fix.
 */
export function splitCsvLine(line: string, sep = ','): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

/** Lower-case, strip accents and punctuation, for header matching. */
function headerKey(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Trim anything that is not a letter off both ends of a name fragment.
 *
 * Projection sheets tag players with a status glyph — an asterisk, a dagger,
 * a rookie marker — and a mis-decoded file leaves U+FFFD stuck to the name.
 * A name never begins or ends with one of those, and leaving them attached
 * makes the row unmatchable: "Dylan Larkin †" matches no NHL player.
 */
function cleanNamePart(s: string): string {
  return s
    .replace(/[ ﻿]/g, ' ')
    .replace(/^[^\p{L}]+/u, '')
    .replace(/[^\p{L}]+$/u, '')
    .trim();
}

/**
 * "Elias-D" → "Elias".
 *
 * The draft kit tells the two Elias Petterssons apart by appending the
 * position to the first name. No NHL player is named that, so the row matched
 * nothing at all — and the file's own Pos column already carries the same
 * information, which the matcher uses to break the tie.
 *
 * A genuine hyphenated first name always has a multi-letter second part
 * (Pierre-Luc, Marc-André, Jean-Gabriel), so a lone position letter cannot be
 * mistaken for one.
 */
function stripPositionSuffix(first: string): string {
  return first.replace(/-(?:[CDGLRW])$/i, '');
}

/** Plain number from "1.65", "12,50", " 82 " — null when not numeric. */
function num(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const NAME_HEADERS = ['nom', 'name', 'player', 'joueur', 'prenom', 'firstname'];
// "nom" is deliberately in BOTH lists. In the operator's file "Nom" holds the
// first name and the surname column has no header at all; in the obvious
// hand-made variant the pair is "Prénom,Nom", where "Nom" is the surname.
// Leaving it out of this list made that second layout produce 900 rows of
// first-name-only — every one unmatched, with a wall of "introuvable" as the
// only clue.
const LAST_HEADERS = ['nom', 'prenomnom', 'lastname', 'nomdefamille', 'surname'];
const TEAM_HEADERS = ['equ', 'equipe', 'team', 'tm', 'eq', 'club'];
const CAP_HEADERS = ['caph', 'caphit', 'cap', 'salary', 'salaire', 'masse', 'capfriendly'];
/** Headers that can only mean the cap hit, never this year's pay. */
const CAP_HIT_HEADERS = ['caph', 'caphit', 'capfriendly', 'massesalariale'];
const POS_HEADERS = ['pos', 'position'];
const PROJ_HEADERS = ['pts', 'points', 'proj', 'projection', 'projpts'];
// A draft-kit export bands its columns under group titles one row above the
// real header: "Saison dernière | Projections | Salaires". PJ, B, P, Pts and
// PPP then appear TWICE, and taking the first match silently reads last
// season's points as the projection.
const PROJ_GROUPS = ['projection', 'projections', 'proj', 'prevision', 'previsions', 'forecast'];
const PAST_GROUPS = ['saisonderniere', 'derniere', 'saisonpassee', 'passee', 'lastseason', 'saison'];

/**
 * Decide what the salary column is denominated in.
 *
 * NHL cap hits run from roughly $0.775M to $14M, so the two plausible
 * encodings are far apart and cannot be confused: as millions every value is
 * under 100, as dollars every value is over 100 000. Anything in between is
 * left `unknown` rather than guessed, and the caller refuses the import.
 */
function detectCapUnit(values: number[]): { unit: CapUnit; reason: string } {
  const positives = values.filter((v) => v > 0);
  if (positives.length === 0) return { unit: 'unknown', reason: 'aucune valeur de salaire lisible' };

  // EVERY value must sit on the same side of the gap, not just the maximum.
  // Deciding from Math.max alone meant a single cell typed in dollars —
  // "925000" pasted among 899 values in millions — flipped the whole file to
  // dollars, so 12.50 became twelve dollars fifty. Every price in the pool
  // would be a millionth of the truth, and the report would be entirely
  // green: the rows all match, nothing is missing, nothing is invalid.
  const asMillions = positives.filter((v) => v < 1000);
  const asDollars = positives.filter((v) => v > 100_000);

  if (asMillions.length === positives.length) {
    return {
      unit: 'millions',
      reason: `les ${positives.length} salaires sont sous 1000 — lus comme des millions`,
    };
  }
  if (asDollars.length === positives.length) {
    return {
      unit: 'dollars',
      reason: `les ${positives.length} salaires dépassent 100 000 — lus comme des dollars`,
    };
  }

  const strays = positives.filter((v) => v >= 1000 && v <= 100_000);
  if (strays.length > 0) {
    return {
      unit: 'unknown',
      reason:
        `${strays.length} valeur(s) ni millions (< 1000) ni dollars (> 100 000), ` +
        `par exemple ${strays.slice(0, 3).join(', ')}`,
    };
  }
  return {
    unit: 'unknown',
    reason:
      `la colonne mélange les unités : ${asMillions.length} valeur(s) en millions et ` +
      `${asDollars.length} en dollars (p. ex. ${asDollars.slice(0, 2).join(', ')})`,
  };
}

/**
 * Read the spreadsheet. Never throws on a malformed row: unreadable lines are
 * reported, not dropped silently.
 */
export function parseSalaryFile(text: string): SalaryFileParse {
  const empty: SalaryFileParse = {
    rows: [],
    layout: {
      nameColumns: 'single', nameHeader: '', teamHeader: '', capHeader: '',
      positionHeader: null, projHeader: null,
      capUnit: 'unknown', capUnitReason: 'fichier vide',
    },
    skippedLines: [],
    unknownTeams: [],
    missingColumns: [],
  };

  const allLines = text.replace(/^﻿/, '').split(/\r?\n/);
  const firstFilled = allLines.findIndex((l) => l.trim() !== '');
  if (firstFilled === -1) return empty;

  const sepOf = (line: string) =>
    splitCsvLine(line, ';').length > splitCsvLine(line, ',').length ? ';' : ',';

  // Find the row that actually names the columns, rather than assuming it is
  // the first filled one. A draft-kit export opens with a title row and a band
  // of group titles, so the old rule read "Trousse de repêchage NHL 2026-2027"
  // as the header and reported "aucune colonne de nom trouvée".
  const SCAN_LINES = 20;
  let headerIdx = -1;
  for (let i = firstFilled; i < Math.min(allLines.length, firstFilled + SCAN_LINES); i++) {
    if (allLines[i].trim() === '') continue;
    const k = splitCsvLine(allLines[i], sepOf(allLines[i])).map(headerKey);
    if (k.some((x) => NAME_HEADERS.includes(x)) && k.some((x) => CAP_HEADERS.includes(x))) {
      headerIdx = i;
      break;
    }
  }
  // Fall back to the old rule, so a file whose header this scan does not
  // recognise still parses and still reports its missing columns as before.
  if (headerIdx === -1) headerIdx = firstFilled;

  // Sniff the delimiter from the header: whichever separator yields more
  // columns is the real one.
  const sep = sepOf(allLines[headerIdx]);
  const header = splitCsvLine(allLines[headerIdx], sep);
  const keys = header.map(headerKey);
  const find = (candidates: string[]) => keys.findIndex((k) => k !== '' && candidates.includes(k));

  // The group band, when there is one: the nearest non-empty row above the
  // header. Its labels are sparse — one cell per band, blanks in between — so
  // a band runs from its label to the next labelled cell.
  const groupIdx = (() => {
    for (let i = headerIdx - 1; i >= 0 && i >= headerIdx - 3; i--) {
      if (allLines[i]?.trim()) return i;
    }
    return -1;
  })();
  const groupKeys = groupIdx === -1 ? [] : splitCsvLine(allLines[groupIdx], sep).map(headerKey);
  /** [start, end) of the band whose title matches, or null. */
  const bandOf = (titles: string[]): [number, number] | null => {
    const start = groupKeys.findIndex((k) => k !== '' && titles.includes(k));
    if (start === -1) return null;
    const next = groupKeys.findIndex((k, i) => i > start && k !== '');
    return [start, next === -1 ? keys.length : next];
  };

  const nameIdx = find(NAME_HEADERS);
  if (nameIdx === -1) {
    return { ...empty, layout: { ...empty.layout, capUnitReason: 'aucune colonne de nom trouvée' } };
  }

  // The surname either has its own header, or — as in the real file — sits in
  // the column right after the first name with a BLANK header. Search for it
  // AFTER the name column so "Nom" cannot be claimed as its own surname.
  let lastIdx = keys.findIndex((k, i) => i > nameIdx && k !== '' && LAST_HEADERS.includes(k));
  if (lastIdx === -1 && keys[nameIdx + 1] === '') lastIdx = nameIdx + 1;

  const teamIdx = find(TEAM_HEADERS);

  // A draft kit carries BOTH "Sal" (what the player is paid this year) and
  // "CapH" (his cap hit). The pool runs on the cap hit, so an unambiguous
  // cap-hit header always wins over a generic salary one — otherwise a file
  // that happens to put "Salaire" first would price McDavid at 14.25 instead
  // of 12.50, with nothing on screen to say which column was read.
  let capIdx = find(CAP_HIT_HEADERS);
  if (capIdx === -1) capIdx = find(CAP_HEADERS);
  const posIdx = find(POS_HEADERS);

  // Projected points, not last season's. When the file bands its columns, take
  // the Pts inside the "Projections" band; failing that, take one OUTSIDE the
  // "Saison dernière" band. Only with no band at all does the first match win
  // — which is what the single-header file wants.
  const projBand = bandOf(PROJ_GROUPS);
  const pastBand = bandOf(PAST_GROUPS);
  const inBand = (i: number, b: [number, number] | null) => b !== null && i >= b[0] && i < b[1];
  let projIdx = -1;
  if (projBand) {
    projIdx = keys.findIndex((k, i) => inBand(i, projBand) && PROJ_HEADERS.includes(k));
  }
  if (projIdx === -1 && pastBand) {
    projIdx = keys.findIndex((k, i) => !inBand(i, pastBand) && k !== '' && PROJ_HEADERS.includes(k));
  }
  if (projIdx === -1) projIdx = find(PROJ_HEADERS);

  // First pass: collect raw values so the unit can be decided from the whole
  // column rather than from whichever row happens to come first.
  type Raw = { cells: string[]; line: number };
  const raws: Raw[] = [];
  const skippedLines: number[] = [];

  for (let i = headerIdx + 1; i < allLines.length; i++) {
    const line = allLines[i];
    // A row of nothing but separators is Excel's idea of a blank line.
    if (line.trim() === '' || /^[,;\s]*$/.test(line)) {
      if (line.trim() !== '') skippedLines.push(i + 1);
      continue;
    }
    const cells = splitCsvLine(line, sep);
    const first = cleanNamePart(cells[nameIdx] ?? '');
    const last = lastIdx >= 0 ? cleanNamePart(cells[lastIdx] ?? '') : '';
    if (!first && !last) { skippedLines.push(i + 1); continue; }
    raws.push({ cells, line: i + 1 });
  }

  const capValues = capIdx >= 0
    ? raws.map((r) => num(r.cells[capIdx] ?? '')).filter((n): n is number => n !== null)
    : [];
  const { unit, reason } = detectCapUnit(capValues);
  const scale = unit === 'millions' ? 1_000_000 : 1;

  const unknownTeams = new Set<string>();
  const rows: SalaryFileRow[] = raws.map((r) => {
    const first = stripPositionSuffix(cleanNamePart(r.cells[nameIdx] ?? ''));
    const last = lastIdx >= 0 ? cleanNamePart(r.cells[lastIdx] ?? '') : '';
    const teamRaw = teamIdx >= 0 ? (r.cells[teamIdx] ?? '').trim() : '';
    const team = normalizeTeamAbbrev(teamRaw);
    // normalizeTeamAbbrev returns the code unchanged when it recognises
    // nothing, so "is it empty" is not the test — "is it a real club" is.
    if (teamRaw && !isKnownTeamAbbrev(teamRaw)) unknownTeams.add(teamRaw);

    const capRaw = capIdx >= 0 ? num(r.cells[capIdx] ?? '') : null;
    const capHitCents =
      capRaw !== null && unit !== 'unknown' ? Math.round(capRaw * scale * 100) : null;

    return {
      name: [first, last].filter(Boolean).join(' '),
      team,
      teamRaw,
      capHitCents,
      capHitRaw: capIdx >= 0 ? (r.cells[capIdx] ?? '').trim() : '',
      position: posIdx >= 0 ? ((r.cells[posIdx] ?? '').trim() || null) : null,
      projPoints: projIdx >= 0 ? num(r.cells[projIdx] ?? '') : null,
      line: r.line,
    };
  });

  return {
    rows,
    layout: {
      nameColumns: lastIdx >= 0 ? 'split' : 'single',
      nameHeader: header[nameIdx]?.trim() || '(sans titre)',
      teamHeader: teamIdx >= 0 ? (header[teamIdx]?.trim() || '(sans titre)') : '—',
      capHeader: capIdx >= 0 ? (header[capIdx]?.trim() || '(sans titre)') : '—',
      positionHeader: posIdx >= 0 ? (header[posIdx]?.trim() || '(sans titre)') : null,
      // Says which band the projection came from: two columns are both called
      // "Pts" and only the operator can tell whether the right one was read.
      projHeader: projIdx >= 0
        ? `${header[projIdx]?.trim() || '(sans titre)'}${
            groupIdx >= 0 && groupKeys.length > 0
              ? ` — section « ${(() => {
                  for (let i = projIdx; i >= 0; i--) if (groupKeys[i]) return splitCsvLine(allLines[groupIdx], sep)[i]?.trim();
                  return '?';
                })()} »`
              : ''
          }`
        : null,
      capUnit: unit,
      capUnitReason: reason,
    },
    skippedLines,
    unknownTeams: [...unknownTeams],
    missingColumns: [
      ...(teamIdx < 0 ? ['équipe'] : []),
      ...(capIdx < 0 ? ['salaire'] : []),
    ],
  };
}
