import { describe, expect, it } from 'vitest';
import {
  STATUSES,
  canTransition,
  isOpen,
  isStatus,
  nextStatus,
  prevStatus,
  progress,
  shouldCelebrate,
} from './status';
import { countdownText, daysUntilChristmas } from './christmas';

describe('status flow', () => {
  it('runs idea → ordered → shipped → wrapped → given', () => {
    expect(STATUSES).toEqual(['idea', 'ordered', 'shipped', 'wrapped', 'given']);
    expect(nextStatus('idea')).toBe('ordered');
    expect(nextStatus('ordered')).toBe('shipped');
    expect(nextStatus('shipped')).toBe('wrapped');
    expect(nextStatus('wrapped')).toBe('given');
    expect(nextStatus('given')).toBeNull();
  });

  it('steps back', () => {
    expect(prevStatus('given')).toBe('wrapped');
    expect(prevStatus('idea')).toBeNull();
  });

  it('allows skipping ahead and stepping back', () => {
    expect(canTransition('idea', 'wrapped')).toBe(true);
    expect(canTransition('given', 'idea')).toBe(true);
  });

  it('refuses no-op and unknown transitions', () => {
    expect(canTransition('idea', 'idea')).toBe(false);
    expect(canTransition('idea', 'lost')).toBe(false);
    expect(canTransition('idea', undefined)).toBe(false);
  });

  it('knows valid statuses', () => {
    expect(isStatus('shipped')).toBe(true);
    expect(isStatus('Shipped')).toBe(false);
  });

  it('a gift is open until given', () => {
    expect(STATUSES.filter(isOpen)).toEqual(['idea', 'ordered', 'shipped', 'wrapped']);
  });

  it('celebrates only when a gift becomes given', () => {
    expect(shouldCelebrate('wrapped', 'given')).toBe(true);
    expect(shouldCelebrate('idea', 'given')).toBe(true);
    expect(shouldCelebrate('given', 'given')).toBe(false);
    expect(shouldCelebrate('given', 'wrapped')).toBe(false);
    expect(shouldCelebrate('ordered', 'shipped')).toBe(false);
  });

  it('progress runs from 0 to 1', () => {
    expect(progress('idea')).toBe(0);
    expect(progress('shipped')).toBe(0.5);
    expect(progress('given')).toBe(1);
  });
});

describe('Christmas countdown', () => {
  it('counts down in December', () => {
    expect(daysUntilChristmas(new Date(2026, 11, 1, 23, 59))).toBe(24);
    expect(daysUntilChristmas(new Date(2026, 11, 24, 8))).toBe(1);
  });

  it('is zero on the day', () => {
    expect(daysUntilChristmas(new Date(2026, 11, 25, 22))).toBe(0);
    expect(countdownText(new Date(2026, 11, 25))).toBe("It's Christmas!");
  });

  it('rolls over to next year after Christmas', () => {
    expect(daysUntilChristmas(new Date(2026, 11, 26))).toBe(364);
  });

  it('words it nicely', () => {
    expect(countdownText(new Date(2026, 11, 24))).toBe('1 day to Christmas');
    expect(countdownText(new Date(2026, 9, 22))).toBe('64 days to Christmas');
  });
});
