import { describe, it, expect } from 'vitest';
import { isSafeUrl } from '../url';

describe('isSafeUrl', () => {
  it('accepts https URLs', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
  });

  it('accepts http URLs', () => {
    expect(isSafeUrl('http://example.com')).toBe(true);
  });

  it('accepts mailto URLs', () => {
    expect(isSafeUrl('mailto:user@example.com')).toBe(true);
  });

  it('rejects javascript: URLs', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });

  it('rejects data: URLs', () => {
    expect(isSafeUrl('data:text/html,<h1>test</h1>')).toBe(false);
  });

  it('rejects vbscript: URLs', () => {
    expect(isSafeUrl('vbscript:msgbox')).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isSafeUrl('not a url')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isSafeUrl('')).toBe(false);
  });

  it('rejects ftp: URLs', () => {
    expect(isSafeUrl('ftp://files.example.com')).toBe(false);
  });
});
