// Putting the groups in the user's own order. Order is the groups' sort_order,
// which the People screen already sorts by.

import type { Group } from './types';

export const STEP = 10;

/** Moves one id a place up (-1) or down (1). Does nothing at either end. */
export function moveItem(ids: string[], id: string, direction: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= ids.length) return ids;
  const next = ids.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * The sort_order each group should have so that `ids` is the order: 10, 20, 30...
 * Only groups whose number would change are returned, so a move writes as little as possible.
 */
export function sortOrdersFor(ids: string[], groups: Pick<Group, 'id' | 'sort_order'>[]): { id: string; sort_order: number }[] {
  const current = new Map(groups.map((g) => [g.id, g.sort_order]));
  const out: { id: string; sort_order: number }[] = [];
  ids.forEach((id, i) => {
    const want = (i + 1) * STEP;
    if (current.has(id) && current.get(id) !== want) out.push({ id, sort_order: want });
  });
  return out;
}
