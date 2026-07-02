import { describe, it, expect } from 'vitest';
import { normalizePollProposals } from '../pollProposals';

const MAX_OPTIONS = 4;

describe('normalizePollProposals', () => {
  it('accepts a bare array of proposals', () => {
    const raw = [{ question: 'Meilleur joueur du CH?', options: ['Suzuki', 'Caufield'] }];
    expect(normalizePollProposals(raw, MAX_OPTIONS)).toEqual(raw);
  });

  it('accepts a { polls: [...] } wrapper', () => {
    const raw = { polls: [{ question: 'Qui gagne la Coupe?', options: ['CH', 'Leafs'] }] };
    expect(normalizePollProposals(raw, MAX_OPTIONS)).toEqual(raw.polls);
  });

  it('returns an empty array for non-poll input', () => {
    expect(normalizePollProposals(null, MAX_OPTIONS)).toEqual([]);
    expect(normalizePollProposals('nope', MAX_OPTIONS)).toEqual([]);
    expect(normalizePollProposals({ foo: 1 }, MAX_OPTIONS)).toEqual([]);
  });

  it('trims the question and caps it at 300 characters', () => {
    const raw = [{ question: `  ${'q'.repeat(400)}  `, options: ['a', 'b'] }];
    expect(normalizePollProposals(raw, MAX_OPTIONS)[0].question).toHaveLength(300);
  });

  it('caps options at maxOptions and drops blank / non-string entries', () => {
    const raw = [{
      question: 'Question valide?',
      options: ['a', '  ', 'b', 42, 'c', 'd', 'e'],
    }];
    expect(normalizePollProposals(raw, MAX_OPTIONS)[0].options).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops proposals with a too-short question', () => {
    const raw = [{ question: 'hi', options: ['a', 'b'] }];
    expect(normalizePollProposals(raw, MAX_OPTIONS)).toEqual([]);
  });

  it('drops proposals with fewer than two options', () => {
    const raw = [{ question: 'Question valide?', options: ['seule'] }];
    expect(normalizePollProposals(raw, MAX_OPTIONS)).toEqual([]);
  });

  it('skips malformed proposals but keeps the valid ones', () => {
    const raw = [
      { question: 'Question valide?', options: ['a', 'b'] },
      { question: 'pas doptions' },
      { options: ['a', 'b'] },
      null,
    ];
    const result = normalizePollProposals(raw, MAX_OPTIONS);
    expect(result).toHaveLength(1);
    expect(result[0].question).toBe('Question valide?');
  });
});
