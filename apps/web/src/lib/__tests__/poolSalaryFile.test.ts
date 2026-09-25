import { describe, it, expect } from 'vitest';
import { parseSalaryFile } from '../poolSalaryFile';
import { normalizeTeamAbbrev, isKnownTeamAbbrev } from '../nhlTeamAliases';

// The header and rows below are copied verbatim from the operator's export,
// including the unnamed surname column and the all-commas separator row.
const REAL_FILE = [
  '#,Nom,,Âge,Équ.,Pos,PJ,B,P,Pts,PPP,CapH',
  '1,Connor,McDavid,29,Edm,C,82,44,91,135,1.65,12.50',
  '2,Nikita,Kucherov,33,TB,RW,79,44,90,134,1.70,9.50',
  '3,Nathan,MacKinnon,31,Col,C,82,51,80,131,1.60,12.60',
  '4,Macklin,Celebrini,20,SJ,C,83,43,68,111,1.34,0.98',
  '7,Mark,Scheifele,33,Win,C,83,37,64,101,1.22,8.50',
  ',,,,,,,,,,,',
  '10,Jason,Robertson,27,Dal,LW,84,43,51,94,1.12,12.00',
].join('\n');

describe('parseSalaryFile — the operator’s real export', () => {
  const parsed = parseSalaryFile(REAL_FILE);

  it('joins the first name and the unnamed surname column', () => {
    expect(parsed.layout.nameColumns).toBe('split');
    expect(parsed.rows.map((r) => r.name)).toEqual([
      'Connor McDavid',
      'Nikita Kucherov',
      'Nathan MacKinnon',
      'Macklin Celebrini',
      'Mark Scheifele',
      'Jason Robertson',
    ]);
  });

  it('reads CapH as millions, not dollars', () => {
    // The whole point: 12.50 is $12.5M. Read literally it would be $12.50,
    // and every price in the pool would be a millionth of the truth.
    expect(parsed.layout.capUnit).toBe('millions');
    expect(parsed.rows[0].capHitCents).toBe(1_250_000_000); // 12.50M = $12,500,000
    expect(parsed.rows[3].capHitCents).toBe(98_000_000); //    0.98M = $980,000
  });

  it('normalizes the spreadsheet’s team codes to the NHL’s', () => {
    expect(parsed.rows.map((r) => r.team)).toEqual([
      'EDM', 'TBL', 'COL', 'SJS', 'WPG', 'DAL',
    ]);
    expect(parsed.unknownTeams).toEqual([]);
  });

  it('keeps the position and the projection', () => {
    expect(parsed.rows[0].position).toBe('C');
    expect(parsed.rows[0].projPoints).toBe(135);
    expect(parsed.layout.projHeader).toBe('Pts');
  });

  it('skips the all-commas separator row and reports the line number', () => {
    expect(parsed.rows).toHaveLength(6);
    expect(parsed.skippedLines).toContain(7);
    expect(parsed.rows[0].line).toBe(2);
  });

  it('records which headers it matched', () => {
    expect(parsed.layout.nameHeader).toBe('Nom');
    expect(parsed.layout.teamHeader).toBe('Équ.');
    expect(parsed.layout.capHeader).toBe('CapH');
  });
});

describe('parseSalaryFile — other shapes', () => {
  it('still reads a plain name/team/salary file in dollars', () => {
    const parsed = parseSalaryFile(
      'name,team,cap_hit\nConnor McDavid,EDM,12500000\nCale Makar,COL,9000000',
    );
    expect(parsed.layout.nameColumns).toBe('single');
    expect(parsed.layout.capUnit).toBe('dollars');
    expect(parsed.rows[0].capHitCents).toBe(1_250_000_000);
  });

  it('refuses to denominate an ambiguous column', () => {
    // 5000 is neither a plausible millions figure nor a plausible salary.
    const parsed = parseSalaryFile('name,team,salary\nX Y,EDM,5000');
    expect(parsed.layout.capUnit).toBe('unknown');
    expect(parsed.rows[0].capHitCents).toBeNull();
  });

  it('reports an unrecognised team instead of guessing', () => {
    const parsed = parseSalaryFile('name,team,cap_hit\nX Y,ZZZ,1000000');
    expect(parsed.unknownTeams).toEqual(['ZZZ']);
  });

  it('returns nothing useful when there is no name column', () => {
    const parsed = parseSalaryFile('a,b,c\n1,2,3');
    expect(parsed.rows).toEqual([]);
  });

  it('tolerates a UTF-8 BOM and CRLF line endings', () => {
    const parsed = parseSalaryFile('﻿name,team,cap_hit\r\nConnor McDavid,EDM,12500000\r\n');
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].name).toBe('Connor McDavid');
  });
});

describe('normalizeTeamAbbrev', () => {
  it('maps the spreadsheet short forms', () => {
    expect(normalizeTeamAbbrev('TB')).toBe('TBL');
    expect(normalizeTeamAbbrev('SJ')).toBe('SJS');
    expect(normalizeTeamAbbrev('Win')).toBe('WPG');
    expect(normalizeTeamAbbrev('LA')).toBe('LAK');
    expect(normalizeTeamAbbrev('NJ')).toBe('NJD');
  });

  it('upper-cases codes that are already correct', () => {
    expect(normalizeTeamAbbrev('Edm')).toBe('EDM');
    expect(normalizeTeamAbbrev('mtl')).toBe('MTL');
  });

  it('strips punctuation', () => {
    expect(normalizeTeamAbbrev('T.B.')).toBe('TBL');
  });

  it('maps the former Arizona codes to Utah', () => {
    expect(normalizeTeamAbbrev('ARI')).toBe('UTA');
    expect(normalizeTeamAbbrev('PHX')).toBe('UTA');
  });

  it('returns an unknown code unchanged rather than guessing', () => {
    expect(normalizeTeamAbbrev('ZZZ')).toBe('ZZZ');
    expect(isKnownTeamAbbrev('ZZZ')).toBe(false);
    expect(isKnownTeamAbbrev('TB')).toBe(true);
  });

  it('handles blank input', () => {
    expect(normalizeTeamAbbrev('')).toBe('');
    expect(normalizeTeamAbbrev(null)).toBe('');
  });
});

describe('parseSalaryFile — a Windows-1252 export decoded as UTF-8', () => {
  // What File.text() produces when Excel wrote ANSI: every byte above 0x7F
  // becomes U+FFFD. The accented header stops matching and the accented
  // names stop matching the NHL roster.
  const MOJIBAKE = [
    '#,Nom,,\uFFFDge,\uFFFDqu.,Pos,PJ,B,P,Pts,PPP,CapH',
    '1,Tim,St\uFFFDtzle,23,Ott,C,82,30,50,80,0.98,8.35',
    '2,Dylan,Larkin \uFFFD,29,Det,C,80,30,45,75,0.94,8.70',
  ].join('\n');

  const parsed = parseSalaryFile(MOJIBAKE);

  it('cannot find the team column, and says so', () => {
    // "Équ." decoded as "\uFFFDqu." normalises to "qu", which matches nothing.
    expect(parsed.layout.teamHeader).toBe('—');
    expect(parsed.missingColumns).toContain('équipe');
  });

  it('strips a stray marker glued to a surname', () => {
    // Without this, "Dylan Larkin \uFFFD" matches no NHL player at all.
    expect(parsed.rows[1].name).toBe('Dylan Larkin');
  });

  it('still reads the salary column, which is pure ASCII', () => {
    expect(parsed.layout.capUnit).toBe('millions');
    expect(parsed.rows[0].capHitCents).toBe(835_000_000);
  });
});

describe('parseSalaryFile — missing columns are reported', () => {
  it('names the columns it could not find', () => {
    const parsed = parseSalaryFile('name\nConnor McDavid');
    expect(parsed.missingColumns).toEqual(['équipe', 'salaire']);
  });
});

describe('parseSalaryFile — the salary unit must be unanimous', () => {
  // One cell typed in dollars among a column of millions used to flip the
  // whole file: max was 925000, so 12.50 became twelve dollars fifty and
  // every price in the pool was a millionth of the truth, with a green report.
  it('refuses a column that mixes millions and dollars', () => {
    const parsed = parseSalaryFile(
      [
        'Nom,,Équ.,CapH',
        'Connor,McDavid,Edm,12.50',
        'Nikita,Kucherov,TB,9.50',
        'Un,Recrue,Mtl,925000',
      ].join('\n'),
    );
    expect(parsed.layout.capUnit).toBe('unknown');
    expect(parsed.layout.capUnitReason).toContain('mélange les unités');
    expect(parsed.rows.every((r) => r.capHitCents === null)).toBe(true);
  });

  it('accepts a column that is entirely millions', () => {
    const parsed = parseSalaryFile('Nom,,Équ.,CapH\nConnor,McDavid,Edm,12.50\nUn,Recrue,Mtl,0.98');
    expect(parsed.layout.capUnit).toBe('millions');
  });
});

describe('parseSalaryFile — other real-world layouts', () => {
  it('reads a Prénom,Nom header pair', () => {
    // "Nom" is a first-name header in the operator's file and a surname header
    // here; getting this wrong produced 900 rows of first-name-only.
    const parsed = parseSalaryFile('Prénom,Nom,Équ.,Pos,CapH\nConnor,McDavid,Edm,C,12.50');
    expect(parsed.layout.nameColumns).toBe('split');
    expect(parsed.rows[0].name).toBe('Connor McDavid');
  });

  it('reads a semicolon-delimited export (French Excel)', () => {
    const parsed = parseSalaryFile('Nom;;Équ.;CapH\nConnor;McDavid;Edm;12.50');
    expect(parsed.rows[0].name).toBe('Connor McDavid');
    expect(parsed.rows[0].team).toBe('EDM');
    expect(parsed.rows[0].capHitCents).toBe(1_250_000_000);
  });

  it('does not invent a surname column when the name column is last', () => {
    const parsed = parseSalaryFile('Équ.,CapH,Nom\nEdm,12.50,Connor McDavid');
    expect(parsed.layout.nameColumns).toBe('single');
    expect(parsed.rows[0].name).toBe('Connor McDavid');
  });
});

/**
 * The "Trousse de repêchage" draft kit: a title row, a band row grouping the
 * columns under "Saison dernière | Projections | Salaires", then the real
 * header. PJ, B, P, Pts and PPP each appear twice, and the salary appears as
 * both "Sal" (this year's pay) and "CapH" (the cap hit).
 */
const DRAFT_KIT = [
  ',,,,,,,,,,,,,,,,,,,,,,,,,,,',
  'Trousse de repêchage NHL 2026-2027,,,,,,,,,,,,,,,,,,,,,,,,,,,',
  ',,,,,,Saison dernière,,,,,,Projections,,,,,,Salaires,',
  '#,Nom,,Âge,Équ.,Pos,PJ,B,P,Pts,PPP,+/-,PJ,B,P,Pts,PPP,+/-,Sal,CapH',
  '1,Connor,McDavid,29,Edm,C,82,48,90,138,1.68,17,82,44,91,135,1.65,20,14.25,12.50',
  '12,Evan,Bouchard,26,Edm,D,82,21,74,95,1.16,25,84,20,72,92,1.10,25,12.00,10.50',
].join('\n');

describe('parseSalaryFile — the banded draft kit', () => {
  const parsed = parseSalaryFile(DRAFT_KIT);

  it('finds the real header row under the title and the band row', () => {
    expect(parsed.layout.nameHeader).toBe('Nom');
    expect(parsed.layout.nameColumns).toBe('split');
    expect(parsed.layout.teamHeader).toBe('Équ.');
    expect(parsed.missingColumns).toEqual([]);
    expect(parsed.rows.map((r) => r.name)).toEqual(['Connor McDavid', 'Evan Bouchard']);
  });

  it('reads the cap hit, not this year’s pay', () => {
    // McDavid: Sal 14.25, CapH 12.50. The pool runs on the cap hit.
    expect(parsed.layout.capHeader).toBe('CapH');
    expect(parsed.rows[0].capHitCents).toBe(1_250_000_000); // 12.50 M$ in cents
    expect(parsed.rows[1].capHitCents).toBe(1_050_000_000); // 10.50 M$
  });

  it('reads the PROJECTED points, not last season’s', () => {
    // McDavid: 138 last season, 135 projected. Both columns are called "Pts".
    expect(parsed.rows[0].projPoints).toBe(135);
    expect(parsed.rows[1].projPoints).toBe(92);
    expect(parsed.layout.projHeader).toContain('Projections');
  });

  it('keeps the position, so defencemen are not filed as forwards', () => {
    expect(parsed.rows.map((r) => r.position)).toEqual(['C', 'D']);
  });
});
