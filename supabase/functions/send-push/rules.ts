// What to say, and when. Pure functions, no network, so they can be tested.
// The money rules mirror src/lib/money.ts (whole cents, never floats for totals).

export interface GiftRow {
  status: string;
  estimate: number | string | null;
  paid: number | string | null;
}

export interface Message {
  title: string;
  body: string;
}

/** "25.5" or 25.5 -> 2550 whole cents; null when empty. */
export function cents(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  return Math.round(Number(value) * 100);
}

/** Spent: paid (else estimate) once past idea. Planned: estimate while an idea. */
export function totals(gifts: GiftRow[]): { spent: number; planned: number } {
  let spent = 0;
  let planned = 0;
  for (const g of gifts) {
    if (g.status === 'idea') planned += cents(g.estimate);
    else spent += g.paid !== null && g.paid !== undefined ? cents(g.paid) : cents(g.estimate);
  }
  return { spent, planned };
}

export function leftToSpend(budgetDollars: number | string, gifts: GiftRow[]): number {
  const t = totals(gifts);
  return cents(budgetDollars) - t.spent - t.planned;
}

/** Alert once when going over; quietly re-arm when back under. */
export function budgetAction(left: number, alreadyNotified: boolean, hasBudget: boolean): 'alert' | 'reset' | 'none' {
  if (!hasBudget) return alreadyNotified ? 'reset' : 'none';
  if (left < 0 && !alreadyNotified) return 'alert';
  if (left >= 0 && alreadyNotified) return 'reset';
  return 'none';
}

export function dollars(cents: number): string {
  const whole = Math.abs(Math.round(cents)) / 100;
  return `$${whole.toLocaleString('en-US', { minimumFractionDigits: whole % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function budgetMessage(left: number): Message {
  return { title: 'Over budget', body: `You're ${dollars(left)} over your Christmas budget.` };
}

/** Long shop titles get cut so the notification stays readable. */
export function shorten(text: string, max = 60): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Title says who did what; the body names the gift and who it is for:
 *   "Sam added a gift idea" / "Lego set · for Ben". Null for edits that don't matter.
 */
export function activityMessage(a: {
  actor: string;
  op: string;
  giftName: string;
  personName: string | null;
  oldStatus: string | null;
  newStatus: string;
}): Message | null {
  const body = a.personName ? `${shorten(a.giftName)} · for ${shorten(a.personName, 30)}` : shorten(a.giftName);
  if (a.op === 'insert') return { title: `${a.actor} added a gift idea`, body };
  if (a.oldStatus && a.oldStatus !== a.newStatus) {
    if (a.newStatus === 'given') return { title: `${a.actor} gave a gift`, body };
    if (a.newStatus === 'idea') return { title: `${a.actor} moved a gift back to an idea`, body };
    return { title: `${a.actor} marked a gift ${a.newStatus}`, body };
  }
  return null;
}

/** Whole days from today until Christmas Day in the given time zone (0 on the day). */
export function daysUntilChristmas(now: Date, timeZone = 'America/Los_Angeles'): number {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now)
    .reduce<Record<string, number>>((acc, p) => (p.type === 'literal' ? acc : { ...acc, [p.type]: Number(p.value) }), {});
  const today = Date.UTC(parts.year, parts.month - 1, parts.day);
  let christmas = Date.UTC(parts.year, 11, 25);
  if (christmas < today) christmas = Date.UTC(parts.year + 1, 11, 25);
  return Math.round((christmas - today) / 86_400_000);
}

export const COUNTDOWN_MILESTONES = [30, 14, 7, 3, 1, 0];

export function isMilestone(days: number): boolean {
  return COUNTDOWN_MILESTONES.includes(days);
}

export function countdownMessage(days: number, gifts: { status: string }[]): Message {
  const open = gifts.filter((g) => g.status !== 'given').length;
  const ideas = gifts.filter((g) => g.status === 'idea').length;
  if (days === 0) {
    return {
      title: 'Merry Christmas!',
      body: open === 0 ? 'Every gift is given. Ho ho ho!' : `${open} gift${open === 1 ? '' : 's'} still to give. Ho ho ho!`,
    };
  }
  const title = days === 1 ? '1 day to Christmas' : `${days} days to Christmas`;
  if (open === 0) return { title, body: 'Every gift is given.' };
  const ideaPart = ideas > 0 ? `, ${ideas} still just ${ideas === 1 ? 'an idea' : 'ideas'}` : '';
  return { title, body: `${open} gift${open === 1 ? '' : 's'} still open${ideaPart}.` };
}

// Same colours and name hash as the app's Avatar (src/components/Avatar.tsx), so a person
// has the same colour on the phone widget as in the app.
const AVATAR_COLORS = ['#18806a', '#b8426f', '#6f52b8', '#b4562c', '#2f6fa8', '#9b3d6a', '#2a7d4f', '#7a4fa0'];

export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export type TileStatus = 'none' | 'ideas' | 'partly' | 'bought';

export interface WidgetPerson {
  id: string;
  name: string;
  initial: string;
  color: string;
  status: TileStatus;
}

export interface WidgetGift {
  id: string;
  person_id: string;
  status: string;
}

const STATUS_ORDER: Record<TileStatus, number> = { none: 0, ideas: 1, partly: 2, bought: 3 };

/**
 * The people who most need a gift: nobody-yet first, then ideas only, then partly bought,
 * then done. A gift shared with several people counts for each of them.
 */
export function widgetPeople(
  people: { id: string; name: string }[],
  gifts: WidgetGift[],
  extras: { gift_id: string; person_id: string }[],
  limit = 6,
): WidgetPerson[] {
  const extraBy = new Map<string, string[]>();
  for (const e of extras) extraBy.set(e.gift_id, [...(extraBy.get(e.gift_id) ?? []), e.person_id]);
  const counts = new Map<string, { ideas: number; bought: number }>();
  for (const g of gifts) {
    for (const id of [g.person_id, ...(extraBy.get(g.id) ?? [])]) {
      const c = counts.get(id) ?? { ideas: 0, bought: 0 };
      if (g.status === 'idea') c.ideas++;
      else c.bought++;
      counts.set(id, c);
    }
  }
  const tiles = people.map((p): WidgetPerson => {
    const c = counts.get(p.id) ?? { ideas: 0, bought: 0 };
    const status: TileStatus = c.ideas === 0 && c.bought === 0 ? 'none' : c.bought === 0 ? 'ideas' : c.ideas === 0 ? 'bought' : 'partly';
    const first = p.name.trim().split(/\s+/)[0] ?? p.name;
    return { id: p.id, name: first.slice(0, 12), initial: ([...first][0] ?? '?').toUpperCase(), color: avatarColor(p.name), status };
  });
  return tiles.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name)).slice(0, limit);
}

export interface WidgetSummary {
  name: string;
  days: number;
  open: number;
  ideas: number;
  hasBudget: boolean;
  leftCents: number;
  /** "$892", or "-$50" when over; empty when no budget is set. */
  leftText: string;
  /** Up to six people who most need a gift. First names only. */
  people: WidgetPerson[];
}

/** Everything the phone widget shows: totals, first names and who needs a gift. Never gift names. */
export function widgetSummary(
  household: { name: string; budget: number | string },
  gifts: GiftRow[],
  days: number,
  people: WidgetPerson[] = [],
): WidgetSummary {
  const hasBudget = Number(household.budget) > 0;
  const leftCents = leftToSpend(household.budget, gifts);
  return {
    name: household.name,
    days,
    open: gifts.filter((g) => g.status !== 'given').length,
    ideas: gifts.filter((g) => g.status === 'idea').length,
    hasBudget,
    leftCents,
    leftText: hasBudget ? `${leftCents < 0 ? '-' : ''}${dollars(leftCents)}` : '',
    people,
  };
}
