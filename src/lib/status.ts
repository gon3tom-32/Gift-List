// The gift status flow: idea → ordered → shipped → wrapped → given.

export const STATUSES = ['idea', 'ordered', 'shipped', 'wrapped', 'given'] as const;
export type GiftStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<GiftStatus, string> = {
  idea: 'Idea',
  ordered: 'Ordered',
  shipped: 'Shipped',
  wrapped: 'Wrapped',
  given: 'Given',
};

/** The button text for moving a gift to the next step. */
export const NEXT_ACTION: Record<GiftStatus, string | null> = {
  idea: 'Mark ordered',
  ordered: 'Mark shipped',
  shipped: 'Mark wrapped',
  wrapped: 'Mark given',
  given: null,
};

export function isStatus(value: unknown): value is GiftStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

export function statusIndex(s: GiftStatus): number {
  return STATUSES.indexOf(s);
}

/** The next step, or null once the gift has been given. */
export function nextStatus(s: GiftStatus): GiftStatus | null {
  return STATUSES[statusIndex(s) + 1] ?? null;
}

export function prevStatus(s: GiftStatus): GiftStatus | null {
  const i = statusIndex(s);
  return i > 0 ? STATUSES[i - 1] : null;
}

/**
 * Any move between two different known statuses is allowed: people skip
 * steps (bought in a shop → wrapped) and step back to fix mistakes.
 */
export function canTransition(from: GiftStatus, to: unknown): to is GiftStatus {
  return isStatus(to) && to !== from;
}

/** A gift counts as "open" until it has been given. */
export function isOpen(s: GiftStatus): boolean {
  return s !== 'given';
}

/** Confetti only when a gift becomes given, not when it's re-saved. */
export function shouldCelebrate(from: GiftStatus, to: GiftStatus): boolean {
  return from !== 'given' && to === 'given';
}

/** 0..1 for the progress strip. */
export function progress(s: GiftStatus): number {
  return statusIndex(s) / (STATUSES.length - 1);
}
