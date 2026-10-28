// "Download my list": turns the loaded household into a CSV that opens in Excel,
// Numbers or Google Sheets. Money stays exact (whole cents turned into "12.50").

import { centsToDb } from './money';
import { extrasByGift } from './recipients';
import { STATUS_LABELS } from './status';
import { memberName, type Family, type Gift, type GiftRecipient, type Group, type Member, type Person } from './types';

export interface ExportData {
  groups: Group[];
  families: Family[];
  people: Person[];
  gifts: Gift[];
  recipients: GiftRecipient[];
  members: Member[];
}

const HEADER = [
  'Person',
  'Group',
  'Family',
  'Gift',
  'Store',
  'Link',
  'Status',
  'Estimate',
  'Paid',
  'Buyer',
  'Shared with',
  'Ship by',
  'Payment method',
  'Added by',
  'Added on',
];

/** Quotes a cell. A leading = + - @ (or tab/CR) would run as a formula in a spreadsheet, so it gets an apostrophe. */
export function csvCell(value: string | null | undefined): string {
  let text = value ?? '';
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

export function buildCsv(data: ExportData): string {
  const groupName = new Map(data.groups.map((g) => [g.id, g.name]));
  const groupOrder = new Map(data.groups.map((g) => [g.id, g.sort_order]));
  const familyName = new Map(data.families.map((f) => [f.id, f.name]));
  const personName = new Map(data.people.map((p) => [p.id, p.name]));
  const memberById = new Map(data.members.map((m) => [m.user_id, m]));
  const extras = extrasByGift(data.recipients);

  const giftsByPerson = new Map<string, Gift[]>();
  for (const g of data.gifts) giftsByPerson.set(g.person_id, [...(giftsByPerson.get(g.person_id) ?? []), g]);

  const people = [...data.people].sort(
    (a, b) =>
      (groupOrder.get(a.group_id) ?? 0) - (groupOrder.get(b.group_id) ?? 0) || a.name.localeCompare(b.name),
  );

  const rows: string[][] = [];
  for (const p of people) {
    const base = [p.name, groupName.get(p.group_id) ?? '', p.family_id ? (familyName.get(p.family_id) ?? '') : ''];
    const gifts = (giftsByPerson.get(p.id) ?? []).sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (gifts.length === 0) {
      rows.push([...base, ...Array(HEADER.length - base.length).fill('')]);
      continue;
    }
    for (const g of gifts) {
      const shared = (extras.get(g.id) ?? []).map((id) => personName.get(id) ?? '').filter(Boolean);
      rows.push([
        ...base,
        g.name,
        g.store ?? '',
        g.link ?? '',
        STATUS_LABELS[g.status],
        centsToDb(g.estimate) ?? '',
        centsToDb(g.paid) ?? '',
        g.shared ? 'Both of us' : g.assigned_to ? memberName(memberById.get(g.assigned_to)) : '',
        shared.join('; '),
        g.ship_by ?? '',
        g.payment_method ?? '',
        g.created_by ? memberName(memberById.get(g.created_by)) : 'Someone',
        day(g.created_at),
      ]);
    }
  }

  const lines = [HEADER, ...rows].map((r) => r.map(csvCell).join(','));
  // The BOM makes Excel read the file as UTF-8 (so names with accents survive).
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function exportFileName(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `gift-list-${y}-${m}-${d}.csv`;
}

/** Hands the CSV to the browser as a download. */
export function downloadCsv(csv: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
