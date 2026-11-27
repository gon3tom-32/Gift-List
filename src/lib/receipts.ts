// Receipt math, in whole cents. A receipt can cover several gifts; each gift keeps its own
// "paid" (tax included). The receipt's optional total is only used to check that they add up.

import type { Cents } from './money';
import type { Gift, GiftReceipt, Receipt } from './types';

export function receiptsForGift(giftId: string, links: GiftReceipt[], receipts: Receipt[]): Receipt[] {
  const ids = new Set(links.filter((l) => l.gift_id === giftId).map((l) => l.receipt_id));
  return receipts.filter((r) => ids.has(r.id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function giftsOnReceipt(receiptId: string, links: GiftReceipt[], gifts: Gift[]): Gift[] {
  const ids = new Set(links.filter((l) => l.receipt_id === receiptId).map((l) => l.gift_id));
  return gifts.filter((g) => ids.has(g.id));
}

export interface Coverage {
  /** what the attached gifts say they paid, added up */
  paid: Cents;
  /** how many attached gifts have no paid amount yet */
  missing: number;
  /** receipt total minus paid; positive means money not on a gift yet. Null without a total. */
  difference: Cents | null;
}

export function receiptCoverage(total: Cents | null, gifts: Pick<Gift, 'paid'>[]): Coverage {
  const paid = gifts.reduce((n, g) => n + (g.paid ?? 0), 0);
  return {
    paid,
    missing: gifts.filter((g) => g.paid === null).length,
    difference: total === null ? null : total - paid,
  };
}
