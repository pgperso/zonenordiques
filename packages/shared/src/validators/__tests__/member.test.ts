import { describe, it, expect } from 'vitest';
import { validateUsername, validateEmail, validatePassword } from '../member';

describe('validateUsername', () => {
  it('accepts valid usernames', () => {
    expect(validateUsername('john_doe')).toBeNull();
    expect(validateUsername('Player-1')).toBeNull();
    expect(validateUsername('abc')).toBeNull();
  });

  it('rejects too short', () => {
    expect(validateUsername('ab')).not.toBeNull();
  });

  it('rejects too long', () => {
    expect(validateUsername('a'.repeat(51))).not.toBeNull();
  });

  it('rejects special characters', () => {
    expect(validateUsername('user@name')).not.toBeNull();
    expect(validateUsername('user name')).not.toBeNull();
    expect(validateUsername('user.name')).not.toBeNull();
  });
});

describe('validateEmail', () => {
  it('accepts valid emails', () => {
    expect(validateEmail('user@example.com')).toBeNull();
    expect(validateEmail('test+tag@domain.org')).toBeNull();
  });

  it('rejects invalid emails', () => {
    expect(validateEmail('not-an-email')).not.toBeNull();
    expect(validateEmail('@domain.com')).not.toBeNull();
    expect(validateEmail('user@')).not.toBeNull();
  });
});

describe('validatePassword', () => {
  it('accepts valid passwords', () => {
    expect(validatePassword('12345678')).toBeNull();
    expect(validatePassword('a very long password')).toBeNull();
  });

  it('rejects too short', () => {
    expect(validatePassword('1234567')).not.toBeNull();
  });
});
