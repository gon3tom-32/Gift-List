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
  shorten,
  widgetSummary,
} from './rules.ts';
import { checkWidgetToken, makeWidgetToken } from './widgetToken.ts';

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
    expect(activityMessage({ ...base, op: 'insert' })).toEqual({ title: 'Sam added a gift idea', body: 'Lego · for Ben' });
  });
  it('announces status changes', () => {
    expect(activityMessage({ ...base, op: 'update', oldStatus: 'idea', newStatus: 'ordered' })).toEqual({
      title: 'Sam marked a gift ordered',
      body: 'Lego · for Ben',
    });
    expect(activityMessage({ ...base, op: 'update', oldStatus: 'wrapped', newStatus: 'given' })?.title).toBe('Sam gave a gift');
  });
  it('cuts very long shop titles', () => {
    const long = 'Mini Sax Alto Soprano Saxophone Handmade In USA Black With Case And Many Accessories Included';
    const body = activityMessage({ ...base, op: 'insert', giftName: long })?.body ?? '';
    const giftPart = body.split(' · for')[0];
    expect(giftPart.length).toBeLessThanOrEqual(60);
    expect(giftPart.endsWith('…')).toBe(true);
    expect(shorten('Lego')).toBe('Lego');
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
    expect(countdownMessage(10, gifts)).toEqual({ title: '10 days to Christmas', body: '3 gifts still open, 2 still just ideas.' });
    expect(countdownMessage(1, [{ status: 'given' }])).toEqual({ title: '1 day to Christmas', body: 'Every gift is given.' });
    expect(countdownMessage(0, gifts).title).toBe('Merry Christmas!');
  });
});

describe('widgetSummary', () => {
  const gifts = [
    { status: 'idea', estimate: 25, paid: null },
    { status: 'ordered', estimate: 50, paid: 45.5 },
    { status: 'given', estimate: 10, paid: 10 },
  ];
  it('counts open gifts and money left, with no names', () => {
    const w = widgetSummary({ name: 'Gift List 2026', budget: 1000 }, gifts, 63);
    expect(w).toEqual({ name: 'Gift List 2026', days: 63, open: 2, ideas: 1, hasBudget: true, leftCents: 100000 - 2500 - 4550 - 1000, leftText: '$919.50' });
  });
  it('shows a minus when over budget and nothing when there is no budget', () => {
    expect(widgetSummary({ name: 'x', budget: 50 }, gifts, 5).leftText).toBe('-$30.50');
    const none = widgetSummary({ name: 'x', budget: 0 }, gifts, 5);
    expect(none.hasBudget).toBe(false);
    expect(none.leftText).toBe('');
  });
});

describe('widget links', () => {
  const user = '8fd056cd-7293-4640-aec2-82e58b50c673';
  it('accepts a link the server made', async () => {
    const token = await makeWidgetToken(user, 'secret-one');
    expect(await checkWidgetToken(token, 'secret-one')).toBe(user);
  });
  it('rejects edited, forged, wrong-secret and empty links', async () => {
    const token = await makeWidgetToken(user, 'secret-one');
    expect(await checkWidgetToken(token, 'secret-two')).toBeNull();
    expect(await checkWidgetToken(token.replace(user, '11111111-2222-3333-4444-555555555555'), 'secret-one')).toBeNull();
    expect(await checkWidgetToken(`${user}.AAAA`, 'secret-one')).toBeNull();
    expect(await checkWidgetToken('nonsense', 'secret-one')).toBeNull();
    expect(await checkWidgetToken(null, 'secret-one')).toBeNull();
    expect(await checkWidgetToken(token, '')).toBeNull();
  });
});
