import { describe, expect, it } from 'vitest';
import { extrasByGift, giftCount, giftsLostWith, recipientIds } from './recipients';

describe('recipients', () => {
  const rows = [
    { gift_id: 'g1', person_id: 'p3', household_id: 'h' },
    { gift_id: 'g1', person_id: 'p2', household_id: 'h' },
    { gift_id: 'g2', person_id: 'p9', household_id: 'h' },
  ];
  it('groups extras by gift in a steady order', () => {
    const map = extrasByGift(rows);
    expect(map.get('g1')).toEqual(['p2', 'p3']);
    expect(map.get('g2')).toEqual(['p9']);
  });
  it('puts the main person first and handles gifts with no extras', () => {
    const map = extrasByGift(rows);
    expect(recipientIds({ id: 'g1', person_id: 'p1' }, map)).toEqual(['p1', 'p2', 'p3']);
    expect(recipientIds({ id: 'g7', person_id: 'p5' }, map)).toEqual(['p5']);
  });

  it('only loses gifts when every recipient is deleted', () => {
    const map = extrasByGift(rows);
    const gifts = [
      { id: 'g1', person_id: 'p1' }, // shared with p2, p3
      { id: 'g2', person_id: 'p8' }, // shared with p9
      { id: 'g3', person_id: 'p1' }, // only p1
    ];
    expect(giftsLostWith(gifts, map, new Set(['p1'])).map((g) => g.id)).toEqual(['g3']);
    expect(giftsLostWith(gifts, map, new Set(['p1', 'p2', 'p3'])).map((g) => g.id)).toEqual(['g1', 'g3']);
  });
});

describe('giftCount', () => {
  const extras = extrasByGift([{ gift_id: 'shared', person_id: 'p2', household_id: 'h' }]);
  const heads = new Map([
    ['teachers', 12],
    ['mom', 1],
  ]);
  it('uses the headcount of a group that is the only recipient', () => {
    expect(giftCount({ id: 'g', person_id: 'teachers' }, extras, heads)).toBe(12);
  });
  it('is 1 for one person, unknown people and shared gifts', () => {
    expect(giftCount({ id: 'g', person_id: 'mom' }, extras, heads)).toBe(1);
    expect(giftCount({ id: 'g', person_id: 'nobody' }, extras, heads)).toBe(1);
    expect(giftCount({ id: 'shared', person_id: 'teachers' }, extras, heads)).toBe(1);
  });
});
