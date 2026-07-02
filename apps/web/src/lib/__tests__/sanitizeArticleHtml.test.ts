import { describe, it, expect } from 'vitest';
import { sanitizeArticleHtml, sanitizeArticleText } from '../sanitizeArticleHtml';

describe('sanitizeArticleHtml', () => {
  it('keeps allowed formatting tags', () => {
    const html = '<p>Un <strong>bon</strong> <em>texte</em></p><h2>Titre</h2><ul><li>x</li></ul>';
    expect(sanitizeArticleHtml(html)).toBe(html);
  });

  it('keeps links with safe href attributes', () => {
    const out = sanitizeArticleHtml('<a href="https://example.com">lien</a>');
    expect(out).toContain('href="https://example.com"');
  });

  it('removes <script> tags entirely', () => {
    const out = sanitizeArticleHtml('<p>ok</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });

  it('strips inline style attributes', () => {
    const out = sanitizeArticleHtml('<p style="color:red">texte</p>');
    expect(out).not.toContain('style');
    expect(out).toContain('texte');
  });

  it('strips event-handler attributes', () => {
    const out = sanitizeArticleHtml('<img src="https://example.com/x.png" onerror="alert(1)" alt="x">');
    expect(out).not.toContain('onerror');
  });

  it('drops a javascript: href', () => {
    const out = sanitizeArticleHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('removes disallowed tags but keeps their text content', () => {
    const out = sanitizeArticleHtml('<div><h1>Titre</h1><p>corps</p></div>');
    expect(out).not.toContain('<div');
    expect(out).not.toContain('<h1');
    expect(out).toContain('Titre');
    expect(out).toContain('<p>corps</p>');
  });
});

describe('sanitizeArticleText', () => {
  it('strips every tag, keeping only text', () => {
    expect(sanitizeArticleText('<strong>Gros</strong> titre')).toBe('Gros titre');
  });

  it('neutralizes a script payload in a plain field', () => {
    const out = sanitizeArticleText('Titre<script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
  });

  it('leaves plain text unchanged', () => {
    expect(sanitizeArticleText('Un titre normal')).toBe('Un titre normal');
  });
});
