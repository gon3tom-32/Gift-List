import { describe, expect, it } from 'vitest';
import { parseCollapsed, toggleCollapsed } from './collapsed';

describe('parseCollapsed', () => {
  it('reads a list of ids', () => {
    expect(parseCollapsed('["a","b"]')).toEqual(['a', 'b']);
  });
  it('treats missing, broken or odd storage as nothing collapsed', () => {
    expect(parseCollapsed(null)).toEqual([]);
    expect(parseCollapsed('')).toEqual([]);
    expect(parseCollapsed('{not json')).toEqual([]);
    expect(parseCollapsed('{"a":1}')).toEqual([]);
    expect(parseCollapsed('"a"')).toEqual([]);
  });
  it('drops anything that is not a string', () => {
    expect(parseCollapsed('["a",1,null,"b"]')).toEqual(['a', 'b']);
  });
});

describe('toggleCollapsed', () => {
  it('collapses and expands', () => {
    expect(toggleCollapsed([], 'g1')).toEqual(['g1']);
    expect(toggleCollapsed(['g1', 'g2'], 'g1')).toEqual(['g2']);
  });
});
