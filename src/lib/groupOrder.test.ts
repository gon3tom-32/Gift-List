import { describe, expect, it } from 'vitest';
import { moveItem, sortOrdersFor } from './groupOrder';

describe('moveItem', () => {
  const ids = ['a', 'b', 'c', 'd'];
  it('moves a group up and down one place', () => {
    expect(moveItem(ids, 'c', -1)).toEqual(['a', 'c', 'b', 'd']);
    expect(moveItem(ids, 'b', 1)).toEqual(['a', 'c', 'b', 'd']);
  });
  it('does nothing at the top, at the bottom or for an unknown id', () => {
    expect(moveItem(ids, 'a', -1)).toEqual(ids);
    expect(moveItem(ids, 'd', 1)).toEqual(ids);
    expect(moveItem(ids, 'zzz', 1)).toEqual(ids);
  });
  it('does not change the list it was given', () => {
    moveItem(ids, 'c', -1);
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('sortOrdersFor', () => {
  it('numbers the groups 10, 20, 30 in the new order', () => {
    const groups = [
      { id: 'a', sort_order: 1794000001 },
      { id: 'b', sort_order: 1794000002 },
      { id: 'c', sort_order: 1794000003 },
    ];
    expect(sortOrdersFor(['b', 'a', 'c'], groups)).toEqual([
      { id: 'b', sort_order: 10 },
      { id: 'a', sort_order: 20 },
      { id: 'c', sort_order: 30 },
    ]);
  });
  it('writes only the groups whose number changes', () => {
    const groups = [
      { id: 'a', sort_order: 10 },
      { id: 'b', sort_order: 20 },
      { id: 'c', sort_order: 30 },
    ];
    expect(sortOrdersFor(['a', 'c', 'b'], groups)).toEqual([
      { id: 'c', sort_order: 20 },
      { id: 'b', sort_order: 30 },
    ]);
  });
  it('gives groups that shared a number a clear order', () => {
    const groups = [
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 0 },
    ];
    expect(sortOrdersFor(['b', 'a'], groups).map((g) => g.sort_order)).toEqual([10, 20]);
  });
  it('ignores ids that are not groups any more', () => {
    expect(sortOrdersFor(['gone', 'a'], [{ id: 'a', sort_order: 10 }])).toEqual([{ id: 'a', sort_order: 20 }]);
  });
});
