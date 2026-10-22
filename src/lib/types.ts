import type { Cents } from './money';
import { toCents } from './money';
import type { GiftStatus } from './status';

export const GROUP_ICONS = ['gift', 'paw', 'briefcase', 'tree', 'heart', 'star'] as const;
export type GroupIcon = (typeof GROUP_ICONS)[number];

export interface Household {
  id: string;
  name: string;
  budget: Cents;
}

export interface Member {
  user_id: string;
  role: 'owner' | 'editor';
  email: string | null;
  display_name: string | null;
}

export interface Invite {
  id: string;
  email: string;
  accepted_at: string | null;
}

export interface Group {
  id: string;
  household_id: string;
  name: string;
  icon: GroupIcon;
  budget: Cents | null;
  sort_order: number;
  created_at: string;
}

export interface Person {
  id: string;
  household_id: string;
  group_id: string;
  name: string;
  budget: Cents | null;
  photo_path: string | null;
  created_at: string;
}

export interface Gift {
  id: string;
  household_id: string;
  person_id: string;
  name: string;
  store: string | null;
  link: string | null;
  photo_path: string | null;
  estimate: Cents | null;
  paid: Cents | null;
  status: GiftStatus;
  assigned_to: string | null;
  shared: boolean;
  ship_by: string | null;
  payment_method: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GiftEvent {
  id: number;
  gift_id: string;
  user_id: string | null;
  from_status: GiftStatus | null;
  to_status: GiftStatus;
  created_at: string;
}

type Row = Record<string, unknown>;

// Rows arrive with numeric columns as numbers or strings; turn them into cents.
export const fromDb = {
  household: (r: Row): Household => ({
    id: r.id as string,
    name: r.name as string,
    budget: toCents(r.budget as string) ?? 0,
  }),
  group: (r: Row): Group => ({ ...(r as unknown as Group), budget: toCents(r.budget as string) }),
  person: (r: Row): Person => ({ ...(r as unknown as Person), budget: toCents(r.budget as string) }),
  gift: (r: Row): Gift => ({
    ...(r as unknown as Gift),
    estimate: toCents(r.estimate as string),
    paid: toCents(r.paid as string),
  }),
};

export function memberName(m: Member | undefined): string {
  if (!m) return 'Someone';
  if (m.display_name) return m.display_name;
  if (m.email) return m.email.split('@')[0];
  return 'Partner';
}
