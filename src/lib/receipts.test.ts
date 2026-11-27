import { describe, expect, it } from 'vitest';
import { giftsOnReceipt, receiptCoverage, receiptsForGift } from './receipts';
import type { Gift, GiftReceipt, Receipt } from './types';

const r = (id: string, created_at: string): Receipt => ({
  id,
  household_id: 'h',
  photo_path: 'p',
  total: null,
  store: null,
  created_by: null,
  created_at,
});
const g = (id: string, paid: number | null) => ({ id, paid }) as Gift;
const links: GiftReceipt[] = [
  { gift_id: 'a', receipt_id: 'r1', household_id: 'h' },
  { gift_id: 'b', receipt_id: 'r1', household_id: 'h' },
  { gift_id: 'a', receipt_id: 'r2', household_id: 'h' },
];

describe('receipts', () => {
  it('finds receipts for a gift, oldest first', () => {
    const list = receiptsForGift('a', links, [r('r2', '2026-01-02'), r('r1', '2026-01-01'), r('r3', '2026-01-03')]);
    expect(list.map((x) => x.id)).toEqual(['r1', 'r2']);
  });

  it('finds the gifts on a receipt', () => {
    expect(giftsOnReceipt('r1', links, [g('a', 1), g('b', 2), g('c', 3)]).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('adds up paid amounts and shows what is left of the total, in cents', () => {
    const c = receiptCoverage(3145, [g('a', 1999), g('b', 1000)]);
    expect(c).toEqual({ paid: 2999, missing: 0, difference: 146 });
  });

  it('has no difference without a total and counts gifts with no paid amount', () => {
    expect(receiptCoverage(null, [g('a', 500), g('b', null)])).toEqual({
      paid: 500,
      missing: 1,
      difference: null,
    });
  });

  it('can go negative when gifts add up to more than the total', () => {
    expect(receiptCoverage(1000, [g('a', 1200)]).difference).toBe(-200);
  });
});
