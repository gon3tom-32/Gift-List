import { describe, expect, it } from 'vitest';
import {
  activityMessage,
  budgetAction,
  budgetMessage,
  cents,
  countdownMessage,
  daysUntilChristmas,
  isMilestone,
  leftToSpend,
} from './rules.ts';

describe('money in whole cents', () => {
  it('converts dollars without float drift', () => {
    expect(cents(19.99)).toBe(1999);
    expect(cents('0.1')).toBe(10);
    expect(cents(null)).toBe(0);
  });
  it('spent uses paid else estimate past idea; planned uses estimate while idea', () => {
    const gifts = [
      { status: 'idea', estimate: 25, paid: null },
      { status: 'ordered', estimate: 50, paid: 45.5 },
      { status: 'wrapped', estimate: 30, paid: null },
    ];
    expect(leftToSpend(200, gifts)).toBe(20000 - 2500 - 4550 - 3000);
  });
});

describe('budgetAction', () => {
  it('alerts once when going over', () => {
    expect(budgetAction(-100, false, true)).toBe('alert');
    expect(budgetAction(-100, true, true)).toBe('none');
  });
  it('re-arms when back under, and ignores households with no budget', () => {
    expect(budgetAction(500, true, true)).toBe('reset');
    expect(budgetAction(500, false, true)).toBe('none');
    expect(budgetAction(0, false, false)).toBe('none');
    expect(budgetAction(0, true, false)).toBe('reset');
  });
  it('says how far over', () => {
    expect(budgetMessage(-12550).body).toBe("You're $125.50 over your Christmas budget.");
    expect(budgetMessage(-5000).body).toBe("You're $50 over your Christmas budget.");
  });
});

describe('activityMessage', () => {
  const base = { actor: 'Sam', giftName: 'Lego', personName: 'Ben', oldStatus: null as string | null, newStatus: 'idea' };
  it('announces a new gift', () => {
    expect(activityMessage({ ...base, op: 'insert' })?.body).toBe('Sam added Lego for Ben.');
  });
  it('announces status changes', () => {
    expect(activityMessage({ ...base, op: 'update', oldStatus: 'idea', newStatus: 'ordered' })?.body).toBe('Sam marked Lego for Ben as ordered.');
    expect(activityMessage({ ...base, op: 'update', oldStatus: 'wrapped', newStatus: 'given' })?.body).toBe('Sam gave Lego for Ben.');
  });
  it('stays quiet for edits that do not change the status', () => {
    expect(activityMessage({ ...base, op: 'update', oldStatus: 'idea', newStatus: 'idea' })).toBeNull();
  });
});

describe('countdown', () => {
  it('counts days to Christmas in Pacific time', () => {
    expect(daysUntilChristmas(new Date('2026-10-23T18:00:00Z'))).toBe(63);
    expect(daysUntilChristmas(new Date('2026-12-25T08:00:00Z'))).toBe(0);
    expect(daysUntilChristmas(new Date('2026-12-26T20:00:00Z'))).toBe(364);
  });
  it('only nudges on milestones', () => {
    expect([63, 30, 14, 7, 3, 1, 0].filter(isMilestone)).toEqual([30, 14, 7, 3, 1, 0]);
  });
  it('says how many gifts are still open', () => {
    const gifts = [{ status: 'idea' }, { status: 'idea' }, { status: 'ordered' }, { status: 'given' }];
    expect(countdownMessage(10, gifts).body).toBe('10 days to Christmas. 3 gifts still open, 2 still just ideas.');
    expect(countdownMessage(1, [{ status: 'given' }]).body).toBe('1 day to Christmas. Every gift is given.');
    expect(countdownMessage(0, gifts).title).toBe('Merry Christmas!');
  });
});
