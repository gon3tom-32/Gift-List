import { describe, expect, it } from 'vitest';
import { HATS, hatFor } from './hats';

describe('hatFor', () => {
  it('gives the same hat every time', () => {
    expect(hatFor('abc-123')).toBe(hatFor('abc-123'));
  });
  it('always returns a known hat and uses them all', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const hat = hatFor(`person-${i}`);
      expect(HATS).toContain(hat);
      seen.add(hat);
    }
    expect(seen.size).toBe(HATS.length);
  });
});
