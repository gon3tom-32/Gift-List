import { describe, expect, it } from 'vitest';
import { applyTheme, parseTheme, readTheme, saveTheme } from './theme';

function fakeStore(broken = false) {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => {
      if (broken) throw new Error('blocked');
      return m.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (broken) throw new Error('blocked');
      m.set(k, v);
    },
    removeItem: (k: string) => {
      if (broken) throw new Error('blocked');
      m.delete(k);
    },
  };
}

describe('theme', () => {
  it('falls back to classic for unknown values', () => {
    expect(parseTheme('hawaii')).toBe('hawaii');
    expect(parseTheme('nope')).toBe('classic');
    expect(parseTheme(null)).toBe('classic');
  });

  it('saves and reads the choice', () => {
    const s = fakeStore();
    saveTheme('hawaii', s);
    expect(readTheme(s)).toBe('hawaii');
    saveTheme('classic', s);
    expect(readTheme(s)).toBe('classic');
  });

  it('survives blocked storage', () => {
    const s = fakeStore(true);
    expect(() => saveTheme('hawaii', s)).not.toThrow();
    expect(readTheme(s)).toBe('classic');
  });

  it('applies and clears the attribute and colour bar', () => {
    const attrs = new Map<string, string>();
    const root = {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
    };
    let color = '';
    const meta = { setAttribute: (_: string, v: string) => void (color = v) };
    applyTheme('hawaii', root, meta);
    expect(attrs.get('data-theme')).toBe('hawaii');
    expect(color).toBe('#0f4442');
    applyTheme('classic', root, meta);
    expect(attrs.has('data-theme')).toBe(false);
    expect(color).toBe('#18806a');
  });
});
