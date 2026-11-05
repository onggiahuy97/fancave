import { describe, expect, it } from 'vitest';
import { sanitizeNickname } from '@fancave/shared';

describe('sanitizeNickname', () => {
  it('trims and collapses whitespace', () => {
    expect(sanitizeNickname('   Red   Fan  ')).toBe('Red Fan');
  });

  it('enforces 3-16 characters', () => {
    expect(sanitizeNickname('ab')).toBeNull();
    expect(sanitizeNickname('abc')).toBe('abc');
    expect(sanitizeNickname('a'.repeat(16))).toBe('a'.repeat(16));
    expect(sanitizeNickname('a'.repeat(17))).toBeNull();
  });

  it('strips markup and control characters', () => {
    expect(sanitizeNickname('<b>Bob</b>')).toBe('bBobb');
    expect(sanitizeNickname('Al\u0000ice​')).toBe('Alice');
  });

  it('keeps accented / non-Latin letters', () => {
    expect(sanitizeNickname('Hùng Phạm')).toBe('Hùng Phạm');
    expect(sanitizeNickname('ファン')).toBe('ファン');
  });

  it('rejects names that are empty after cleaning, and non-strings', () => {
    expect(sanitizeNickname('<<>>!!')).toBeNull();
    expect(sanitizeNickname(undefined)).toBeNull();
    expect(sanitizeNickname(42)).toBeNull();
  });
});
