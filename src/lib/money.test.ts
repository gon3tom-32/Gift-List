import { describe, expect, it } from 'vitest';
import {
  centsToDb,
  centsToInput,
  formatCents,
  giftPlanned,
  giftSpent,
  leftToSpend,
  parseMoneyInput,
  personTotals,
  splitCents,
  sumGifts,
  toCents,
  type MoneyGift,
} from './money';

const gift = (status: MoneyGift['status'], estimate: number | null, paid: number | null): MoneyGift => ({
  status,
  estimate,
  paid,
});

describe('toCents', () => {
  it('reads numbers and numeric strings from the database', () => {
    expect(toCents(25)).toBe(2500);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents('19.99')).toBe(1999);
    expect(toCents('0.1')).toBe(10);
    expect(toCents('1234567890.12')).toBe(123456789012);
    expect(toCents(0.07)).toBe(7);
  });

  it('returns null for missing or bad values', () => {
    expect(toCents(null)).toBeNull();
    expect(toCents(undefined)).toBeNull();
    expect(toCents('')).toBeNull();
    expect(toCents('abc')).toBeNull();
  });

  it('avoids float drift that 0.1 + 0.2 would cause', () => {
    expect(toCents(0.1)! + toCents(0.2)!).toBe(30);
  });
});

describe('centsToDb', () => {
  it('writes exact two-decimal strings', () => {
    expect(centsToDb(2500)).toBe('25.00');
    expect(centsToDb(7)).toBe('0.07');
    expect(centsToDb(123456789012)).toBe('1234567890.12');
    expect(centsToDb(-150)).toBe('-1.50');
    expect(centsToDb(null)).toBeNull();
  });

  it('round-trips with toCents', () => {
    for (const c of [0, 1, 99, 100, 2599, 999999]) expect(toCents(centsToDb(c))).toBe(c);
  });
});

describe('parseMoneyInput', () => {
  it('accepts what people type', () => {
    expect(parseMoneyInput('25')).toEqual({ ok: true, cents: 2500 });
    expect(parseMoneyInput('$25.5')).toEqual({ ok: true, cents: 2550 });
    expect(parseMoneyInput(' 1,299.99 ')).toEqual({ ok: true, cents: 129999 });
    expect(parseMoneyInput('.5')).toEqual({ ok: true, cents: 50 });
    expect(parseMoneyInput('12.')).toEqual({ ok: true, cents: 1200 });
  });

  it('treats blank as no amount', () => {
    expect(parseMoneyInput('')).toEqual({ ok: true, cents: null });
    expect(parseMoneyInput('   ')).toEqual({ ok: true, cents: null });
  });

  it('rejects negatives, letters and extra decimals', () => {
    expect(parseMoneyInput('-5').ok).toBe(false);
    expect(parseMoneyInput('ten').ok).toBe(false);
    expect(parseMoneyInput('1.999').ok).toBe(false);
    expect(parseMoneyInput('99999999999').ok).toBe(false);
  });
});

describe('formatting', () => {
  it('formats dollars', () => {
    expect(formatCents(123450)).toBe('$1,234.50');
    expect(formatCents(123450, { whole: true })).toBe('$1,235');
    expect(formatCents(-500)).toBe('-$5.00');
  });

  it('fills inputs without trailing .00', () => {
    expect(centsToInput(2500)).toBe('25');
    expect(centsToInput(2550)).toBe('25.50');
    expect(centsToInput(null)).toBe('');
  });
});

describe('spent and planned', () => {
  it('an idea is planned at its estimate and not spent', () => {
    const g = gift('idea', 4000, null);
    expect(giftPlanned(g)).toBe(4000);
    expect(giftSpent(g)).toBe(0);
  });

  it('an idea with a paid amount still counts only as planned', () => {
    const g = gift('idea', 4000, 3500);
    expect(giftSpent(g)).toBe(0);
    expect(giftPlanned(g)).toBe(4000);
  });

  it('past idea, spent uses paid when entered', () => {
    const g = gift('ordered', 4000, 3550);
    expect(giftSpent(g)).toBe(3550);
    expect(giftPlanned(g)).toBe(0);
  });

  it('past idea, spent falls back to the estimate', () => {
    for (const s of ['ordered', 'shipped', 'wrapped', 'given'] as const) {
      expect(giftSpent(gift(s, 4000, null))).toBe(4000);
    }
  });

  it('a paid amount of zero counts as zero, not the estimate', () => {
    expect(giftSpent(gift('given', 4000, 0))).toBe(0);
  });

  it('missing amounts count as zero', () => {
    expect(giftSpent(gift('ordered', null, null))).toBe(0);
    expect(giftPlanned(gift('idea', null, null))).toBe(0);
  });
});

describe('household totals', () => {
  const gifts = [
    gift('idea', 2500, null), // planned 25
    gift('ordered', 5000, 4999), // spent 49.99
    gift('given', 1000, null), // spent 10
    gift('idea', null, null), // nothing
  ];

  it('sums spent and planned', () => {
    expect(sumGifts(gifts)).toEqual({ spent: 5999, planned: 2500 });
  });

  it('left to spend = budget − spent − planned', () => {
    expect(leftToSpend(10000, sumGifts(gifts))).toBe(1501);
  });

  it('goes negative when over budget', () => {
    expect(leftToSpend(5000, sumGifts(gifts))).toBe(-3499);
  });

  it('is null when no budget is set', () => {
    expect(leftToSpend(null, sumGifts(gifts))).toBeNull();
  });

  it('stays exact across many small amounts', () => {
    const many = Array.from({ length: 1000 }, () => gift('ordered', null, toCents(0.1)));
    expect(sumGifts(many).spent).toBe(10000);
  });
});

describe('splitCents', () => {
  it('divides evenly when it can', () => {
    expect(splitCents(2500, 4)).toEqual([625, 625, 625, 625]);
  });
  it('gives leftover cents to the first people so shares add up exactly', () => {
    expect(splitCents(1000, 3)).toEqual([334, 333, 333]);
    expect(splitCents(1, 4)).toEqual([1, 0, 0, 0]);
    expect(splitCents(1000, 3).reduce((a, b) => a + b, 0)).toBe(1000);
  });
  it('leaves a single recipient alone', () => {
    expect(splitCents(999, 1)).toEqual([999]);
    expect(splitCents(0, 3)).toEqual([0, 0, 0]);
  });
});

describe('personTotals with shared gifts', () => {
  const g = (id: string, person_id: string, status: MoneyGift['status'], estimate: number | null, paid: number | null = null) => ({
    id,
    person_id,
    status,
    estimate,
    paid,
  });
  const extras: Record<string, string[]> = { soap: ['ben', 'joy', 'lily'] };
  const recipientsOf = (x: { id: string; person_id: string }) => [x.person_id, ...(extras[x.id] ?? [])];

  it('divides a shared gift between its recipients', () => {
    const totals = personTotals([g('soap', 'andrew', 'ordered', 2500, 2400)], recipientsOf);
    expect([...totals.entries()].map(([k, v]) => [k, v.spent])).toEqual([
      ['andrew', 600],
      ['ben', 600],
      ['joy', 600],
      ['lily', 600],
    ]);
  });
  it('plans an idea the same way', () => {
    const totals = personTotals([g('soap', 'andrew', 'idea', 1000)], recipientsOf);
    expect(totals.get('andrew')?.planned).toBe(250);
    expect(totals.get('lily')?.planned).toBe(250);
  });
  it('adds a person\'s own gifts to their share', () => {
    const totals = personTotals([g('soap', 'andrew', 'ordered', 2500), g('own', 'ben', 'ordered', 1000)], recipientsOf);
    expect(totals.get('ben')?.spent).toBe(625 + 1000);
  });
  it('never changes the household total', () => {
    const gifts = [g('soap', 'andrew', 'ordered', 1000), g('own', 'ben', 'idea', 333)];
    const people = personTotals(gifts, recipientsOf);
    const sum = [...people.values()].reduce((a, t) => ({ spent: a.spent + t.spent, planned: a.planned + t.planned }), { spent: 0, planned: 0 });
    expect(sum).toEqual(sumGifts(gifts));
  });
});
