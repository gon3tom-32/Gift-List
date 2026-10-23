// Money helpers. The database stores numeric(12,2); in the app every amount
// is a whole number of cents, so totals never touch floating-point math.

import type { GiftStatus } from './status';

export type Cents = number;

/** Turns a database value (number or numeric string) into cents. */
export function toCents(value: number | string | null | undefined): Cents | null {
  if (value === null || value === undefined || value === '') return null;
  const text = typeof value === 'number' ? value.toFixed(2) : String(value).trim();
  const match = /^(-)?(\d+)(?:\.(\d{1,2})\d*)?$/.exec(text);
  if (!match) return null;
  const [, minus, whole, frac = ''] = match;
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return minus ? -cents : cents;
}

/** Turns cents into the exact string Postgres numeric expects, e.g. "12.30". */
export function centsToDb(cents: Cents | null): string | null {
  if (cents === null) return null;
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export type ParsedMoney = { ok: true; cents: Cents | null } | { ok: false; error: string };

/**
 * Reads what someone typed into a price box: "25", "$25.5", "1,299.99".
 * Blank means "no amount". Negative amounts are refused.
 */
export function parseMoneyInput(input: string): ParsedMoney {
  const text = input.trim().replace(/^\$/, '').replace(/,/g, '').trim();
  if (text === '') return { ok: true, cents: null };
  if (!/^\d+(\.\d{0,2})?$/.test(text) && !/^\.\d{1,2}$/.test(text)) {
    return { ok: false, error: 'Use a number like 24.99' };
  }
  const cents = toCents(text.startsWith('.') ? `0${text}` : text.replace(/\.$/, ''));
  if (cents === null) return { ok: false, error: 'Use a number like 24.99' };
  if (cents > 999_999_999_99) return { ok: false, error: 'That amount is too big' };
  return { ok: true, cents };
}

const formatters = new Map<string, Intl.NumberFormat>();

/** "$1,234.50", or "$1,235" when whole is true. */
export function formatCents(cents: Cents, opts: { whole?: boolean } = {}): string {
  const key = opts.whole ? 'whole' : 'exact';
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: opts.whole ? 0 : 2,
      maximumFractionDigits: opts.whole ? 0 : 2,
    });
    formatters.set(key, f);
  }
  // Integer cents -> dollars only for display; totals stay in cents.
  return f.format(cents / 100);
}

/** Shows a blank amount as empty text in an input. */
export function centsToInput(cents: Cents | null): string {
  return cents === null ? '' : centsToDb(cents)!.replace(/\.00$/, '');
}

export interface MoneyGift {
  status: GiftStatus;
  estimate: Cents | null;
  paid: Cents | null;
}

/** Spent: paid if entered, else the estimate, but only once past "idea". */
export function giftSpent(g: MoneyGift): Cents {
  if (g.status === 'idea') return 0;
  return g.paid ?? g.estimate ?? 0;
}

/** Planned: the estimate while the gift is still an idea. */
export function giftPlanned(g: MoneyGift): Cents {
  if (g.status !== 'idea') return 0;
  return g.estimate ?? 0;
}

export interface Totals {
  spent: Cents;
  planned: Cents;
}

export function sumGifts(gifts: Iterable<MoneyGift>): Totals {
  let spent = 0;
  let planned = 0;
  for (const g of gifts) {
    spent += giftSpent(g);
    planned += giftPlanned(g);
  }
  return { spent, planned };
}

/**
 * Splits a whole-cent amount equally. Leftover cents go one each to the first
 * people, so the shares always add up exactly: 1000 / 3 = [334, 333, 333].
 */
export function splitCents(total: Cents, parts: number): Cents[] {
  if (parts <= 1) return [total];
  const base = Math.trunc(total / parts);
  const leftover = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < leftover ? 1 : 0));
}

/**
 * Spent and planned per person when gifts can be shared. Each gift counts once
 * overall: its cost is divided between its recipients (main person first).
 */
export function personTotals(
  gifts: Iterable<MoneyGift & { id: string; person_id: string }>,
  recipientsOf: (g: { id: string; person_id: string }) => string[],
): Map<string, Totals> {
  const out = new Map<string, Totals>();
  for (const g of gifts) {
    const people = recipientsOf(g);
    const spent = splitCents(giftSpent(g), people.length);
    const planned = splitCents(giftPlanned(g), people.length);
    people.forEach((id, i) => {
      const t = out.get(id) ?? { spent: 0, planned: 0 };
      out.set(id, { spent: t.spent + spent[i], planned: t.planned + planned[i] });
    });
  }
  return out;
}

/** Budget − spent − planned. Negative means over budget. Null when there's no budget. */
export function leftToSpend(budget: Cents | null, totals: Totals): Cents | null {
  if (budget === null) return null;
  return budget - totals.spent - totals.planned;
}
