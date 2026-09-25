import { describe, it, expect } from 'vitest';
import { matchSalaryRows, type MatchablePlayer } from '../poolService';

/**
 * The two Elias Petterssons are the reason the position column is read at all:
 * they share a name AND a team, so nothing else in the file separates them.
 */
const PETTERSSONS: MatchablePlayer[] = [
  { playerId: 8483678, fullName: 'Elias Pettersson', teamAbbrev: 'VAN', position: 'D' },
  { playerId: 8480012, fullName: 'Elias Pettersson', teamAbbrev: 'VAN', position: 'C' },
];

const price = 100_000_000; // 1 M$ in cents

describe('matchSalaryRows — homonyms on the same team', () => {
  it('uses the file position to tell the two Petterssons apart', () => {
    const res = matchSalaryRows(PETTERSSONS, [
      { name: 'Elias Pettersson', team: 'VAN', capHit: '', capHitCents: price, position: 'D' },
      { name: 'Elias Pettersson', team: 'VAN', capHit: '', capHitCents: price, position: 'C' },
    ]);
    expect(res.ambiguous).toHaveLength(0);
    expect(res.matched.map((m) => m.playerId).sort()).toEqual([8480012, 8483678]);
    expect(res.matched.find((m) => m.playerId === 8483678)?.position).toBe('D');
    expect(res.matched.find((m) => m.playerId === 8480012)?.position).toBe('F');
  });

  it('reports the homonym rather than guessing when the position cell is empty', () => {
    const res = matchSalaryRows(PETTERSSONS, [
      { name: 'Elias Pettersson', team: 'VAN', capHit: '', capHitCents: price, position: '' },
    ]);
    expect(res.matched).toHaveLength(0);
    expect(res.ambiguous).toHaveLength(1);
    expect(res.ambiguous[0].candidates).toBe(2);
  });

  it('reports the homonym when the position cell is unreadable', () => {
    // poolPosition() answers 'F' for anything it does not know, so an
    // unrecognised cell must not be allowed to vote — it would silently elect
    // the forward.
    const res = matchSalaryRows(PETTERSSONS, [
      { name: 'Elias Pettersson', team: 'VAN', capHit: '', capHitCents: price, position: '???' },
    ]);
    expect(res.matched).toHaveLength(0);
    expect(res.ambiguous).toHaveLength(1);
  });

  it('accepts the position written in French or as a wing code', () => {
    const wingers: MatchablePlayer[] = [
      { playerId: 1, fullName: 'Jean Tremblay', teamAbbrev: 'MTL', position: 'L' },
      { playerId: 2, fullName: 'Jean Tremblay', teamAbbrev: 'MTL', position: 'G' },
    ];
    const res = matchSalaryRows(wingers, [
      { name: 'Jean Tremblay', team: 'MTL', capHit: '', capHitCents: price, position: 'AG' },
      { name: 'Jean Tremblay', team: 'MTL', capHit: '', capHitCents: price, position: 'Gardien' },
    ]);
    expect(res.ambiguous).toHaveLength(0);
    expect(res.matched.map((m) => m.playerId).sort()).toEqual([1, 2]);
  });

  it('still names the player when the salary cell is empty', () => {
    // The file marks pending free agents with "°" and leaves CapH blank. The
    // rule is that they keep their last known salary — which can only be
    // reported, or audited, if the row resolves to a player id.
    const res = matchSalaryRows(
      [{ playerId: 8482124, fullName: 'Adam Fantilli', teamAbbrev: 'CBJ', position: 'C' }],
      [{ name: 'Adam Fantilli', team: 'Cbj', capHit: '', capHitCents: null, position: 'C', line: 107 }],
    );
    expect(res.matched).toHaveLength(0);
    expect(res.invalidPrice).toHaveLength(1);
    expect(res.invalidPrice[0].playerId).toBe(8482124);
    expect(res.invalidPrice[0].row.line).toBe(107);
  });

  it('reports a nameless unpriced row without inventing a player', () => {
    const res = matchSalaryRows(
      [{ playerId: 1, fullName: 'Connor McDavid', teamAbbrev: 'EDM', position: 'C' }],
      [{ name: 'Personne Inconnue', team: 'XXX', capHit: '', capHitCents: null }],
    );
    expect(res.invalidPrice).toHaveLength(1);
    expect(res.invalidPrice[0].playerId).toBeNull();
  });

  it('leaves a single-candidate match alone whatever the position says', () => {
    // A stale or wrong position cell must not un-match a name that is already
    // unique — the position is a tiebreak, not a validator.
    const res = matchSalaryRows(
      [{ playerId: 9, fullName: 'Connor McDavid', teamAbbrev: 'EDM', position: 'C' }],
      [{ name: 'Connor McDavid', team: 'EDM', capHit: '', capHitCents: price, position: 'D' }],
    );
    expect(res.matched).toHaveLength(1);
    expect(res.matched[0].playerId).toBe(9);
  });
});
