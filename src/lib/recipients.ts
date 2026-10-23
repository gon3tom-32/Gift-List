import type { Gift, GiftRecipient } from './types';

/** gift id -> the extra people it is shared with, in a steady order. */
export function extrasByGift(recipients: GiftRecipient[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const r of recipients) map.set(r.gift_id, [...(map.get(r.gift_id) ?? []), r.person_id]);
  for (const [id, people] of map) map.set(id, people.sort());
  return map;
}

/** Everyone a gift is for: the main person first, then the extras. */
export function recipientIds(gift: Pick<Gift, 'id' | 'person_id'>, extras: Map<string, string[]>): string[] {
  return [gift.person_id, ...(extras.get(gift.id) ?? [])];
}
