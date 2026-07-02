import { describe, it, expect } from 'vitest';
import { slugify } from '../slugify';

describe('slugify', () => {
  it('converts to lowercase', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips accents', () => {
    expect(slugify('Café résumé')).toBe('cafe-resume');
  });

  it('replaces spaces and special chars with hyphens', () => {
    expect(slugify('Hello, World! How are you?')).toBe('hello-world-how-are-you');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('---hello---')).toBe('hello');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('a   b   c')).toBe('a-b-c');
  });

  it('truncates to maxLength', () => {
    const long = 'a'.repeat(300);
    expect(slugify(long).length).toBe(200);
  });

  it('respects custom maxLength', () => {
    expect(slugify('hello world test', 5)).toBe('hello');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles French characters', () => {
    expect(slugify('L\'équipe de France à l\'Euro')).toBe('l-equipe-de-france-a-l-euro');
  });
});
