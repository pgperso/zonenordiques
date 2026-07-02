import { describe, it, expect } from 'vitest';
import { sanitizePromptInput, escapeForPrompt, deduplicateNews } from '../promptSafety';

describe('sanitizePromptInput', () => {
  it('trims surrounding whitespace', () => {
    expect(sanitizePromptInput('  hello  ', 100)).toBe('hello');
  });

  it('hard-caps the length', () => {
    expect(sanitizePromptInput('abcdefghij', 4)).toBe('abcd');
  });

  it('replaces backticks so they cannot open a markdown fence', () => {
    expect(sanitizePromptInput('rm `code`', 100)).toBe("rm 'code'");
  });

  it('trims before slicing', () => {
    expect(sanitizePromptInput('   abcdefg', 3)).toBe('abc');
  });
});

describe('escapeForPrompt', () => {
  it('replaces straight and curly double quotes with guillemets', () => {
    expect(escapeForPrompt('say "hi"')).toBe('say «»hi«»');
    expect(escapeForPrompt('say “hi”')).toBe('say «»hi«»');
  });

  it('strips backslashes', () => {
    expect(escapeForPrompt('a\\b\\c')).toBe('abc');
  });

  it('hard-caps at the given max length', () => {
    expect(escapeForPrompt('abcdefghij', 1000).length).toBe(10);
    expect(escapeForPrompt('abcdefghij', 5)).toBe('abcde');
  });

  it('leaves plain text untouched', () => {
    expect(escapeForPrompt('un texte normal')).toBe('un texte normal');
  });
});

describe('deduplicateNews', () => {
  it('collapses the same headline arriving with different language tags', () => {
    const input = ['[FR] Le CH gagne gros', '[EN] Le CH gagne gros', 'Le CH gagne gros'];
    expect(deduplicateNews(input)).toEqual(['[FR] Le CH gagne gros']);
  });

  it('keeps genuinely distinct headlines', () => {
    const input = ['[FR] Le CH gagne', '[FR] Le CH perd'];
    expect(deduplicateNews(input)).toEqual(input);
  });

  it('treats headlines as duplicates only on their first 80 characters', () => {
    const base = 'a'.repeat(80);
    expect(deduplicateNews([`${base}X`, `${base}Y`])).toHaveLength(1);
  });

  it('returns an empty array unchanged', () => {
    expect(deduplicateNews([])).toEqual([]);
  });
});
