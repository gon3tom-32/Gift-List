import type { Gift } from './types';

/**
 * A gift is "new" when someone other than me added or last changed it after
 * the moment I last looked. With no "last looked" time yet (first visit),
 * nothing is flagged, so a fresh sign-in isn't a wall of badges.
 */
export function isNewFromPartner(g: Pick<Gift, 'updated_by' | 'updated_at'>, me: string, seenAt: string | null): boolean {
  if (!seenAt) return false;
  if (!g.updated_by || g.updated_by === me) return false;
  return Date.parse(g.updated_at) > Date.parse(seenAt);
}
