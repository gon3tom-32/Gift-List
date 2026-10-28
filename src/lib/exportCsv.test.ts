import { describe, expect, it } from 'vitest';
import { buildCsv, csvCell, exportFileName, type ExportData } from './exportCsv';
import type { Gift, Member, Person } from './types';

const member = (user_id: string, display_name: string): Member => ({
  user_id,
  role: 'editor',
  email: `${display_name.toLowerCase()}@example.com`,
  display_name,
  last_seen_at: null,
});

const person = (id: string, name: string, group_id = 'g1'): Person => ({
  id,
  household_id: 'h',
  group_id,
  family_id: null,
  name,
  budget: null,
  photo_path: null,
  created_at: '2026-10-01T00:00:00Z',
});

const gift = (over: Partial<Gift>): Gift => ({
  id: 'k1',
  household_id: 'h',
  person_id: 'p1',
  name: 'Scarf',
  store: null,
  link: null,
  photo_path: null,
  estimate: null,
  paid: null,
  status: 'idea',
  assigned_to: null,
  shared: false,
  ship_by: null,
  payment_method: null,
  created_by: 'u1',
  updated_by: null,
  created_at: '2026-10-05T12:00:00Z',
  updated_at: '2026-10-05T12:00:00Z',
  ...over,
});

const base: ExportData = {
  groups: [{ id: 'g1', household_id: 'h', name: 'Our family', icon: 'gift', budget: null, sort_order: 0, created_at: '' }],
  families: [],
  people: [person('p1', 'Mom'), person('p2', 'Dad'), person('p3', 'Emma')],
  gifts: [],
  recipients: [],
  members: [member('u1', 'Alex'), member('u2', 'Jordan')],
};

const lines = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n');

describe('csvCell', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell(null)).toBe('');
  });
  it('defuses spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@home')).toBe("'@home");
  });
});

describe('buildCsv', () => {
  it('starts with a BOM and the header, and lists people without gifts', () => {
    const csv = buildCsv(base);
    expect(csv.startsWith('﻿')).toBe(true);
    const rows = lines(csv);
    expect(rows[0]).toBe(
      'Person,Group,Family,Gift,Store,Link,Status,Estimate,Paid,Buyer,Shared with,Ship by,Payment method,Added by,Added on',
    );
    expect(rows).toHaveLength(4); // header + Dad, Emma, Mom
    expect(rows[1].startsWith('Dad,Our family,,')).toBe(true);
  });

  it('writes exact money, status, buyer and who added it', () => {
    const csv = buildCsv({
      ...base,
      gifts: [gift({ estimate: 8950, paid: 8450, status: 'wrapped', store: 'Nordstrom, Inc.', assigned_to: 'u2' })],
    });
    const row = lines(csv).find((r) => r.startsWith('Mom'))!;
    expect(row).toBe('Mom,Our family,,Scarf,"Nordstrom, Inc.",,Wrapped,89.50,84.50,Jordan,,,,Alex,2026-10-05');
  });

  it('shows shared gifts, "Both of us" and gifts whose creator is gone', () => {
    const csv = buildCsv({
      ...base,
      gifts: [gift({ id: 'k2', name: 'Soap set', shared: true, created_by: null })],
      recipients: [
        { gift_id: 'k2', person_id: 'p2', household_id: 'h' },
        { gift_id: 'k2', person_id: 'p3', household_id: 'h' },
      ],
    });
    const row = lines(csv).find((r) => r.startsWith('Mom'))!;
    expect(row).toContain('Both of us,Dad; Emma');
    expect(row).toContain(',Someone,');
  });

  it('keeps a gift named like a formula from running', () => {
    const csv = buildCsv({ ...base, gifts: [gift({ name: '=1+1' })] });
    expect(csv).toContain(",'=1+1,");
  });
});

describe('buildCsv order', () => {
  it('follows the order of the groups on the list, then names', () => {
    const csv = buildCsv({
      ...base,
      groups: [
        { id: 'g1', household_id: 'h', name: 'Pets', icon: 'paw', budget: null, sort_order: 1, created_at: '' },
        { id: 'g2', household_id: 'h', name: 'Family', icon: 'gift', budget: null, sort_order: 0, created_at: '' },
      ],
      people: [person('p1', 'Biscuit', 'g1'), person('p2', 'Zed', 'g2'), person('p3', 'Amy', 'g2')],
    });
    expect(lines(csv).slice(1).map((r) => r.split(',')[0])).toEqual(['Amy', 'Zed', 'Biscuit']);
  });
});

describe('exportFileName', () => {
  it('uses the local date', () => {
    expect(exportFileName(new Date(2026, 9, 7))).toBe('gift-list-2026-10-07.csv');
  });
});
