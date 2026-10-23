import { describe, expect, it } from 'vitest';
import { sameSecret } from './auth.ts';

describe('sameSecret', () => {
  it('accepts an exact match', () => {
    expect(sameSecret('abc123', 'abc123')).toBe(true);
  });
  it('rejects different, longer, shorter and empty values', () => {
    expect(sameSecret('abc123', 'abc124')).toBe(false);
    expect(sameSecret('abc123', 'abc1234')).toBe(false);
    expect(sameSecret('abc123', 'abc12')).toBe(false);
    expect(sameSecret('', '')).toBe(false);
    expect(sameSecret('abc', '')).toBe(false);
  });
});
