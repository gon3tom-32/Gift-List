import { describe, expect, it } from 'vitest';
import { extrasByGift, recipientIds } from './recipients';

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
});
