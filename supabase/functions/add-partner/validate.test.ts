import { describe, expect, it } from 'vitest';
import { validateAddPartner } from './validate.ts';

const HID = '33333333-3333-4333-8333-333333333333';

describe('validateAddPartner', () => {
  it('accepts and cleans a good request', () => {
    expect(validateAddPartner({ household_id: HID, email: '  Alex@Example.COM ', password: 'candycane' })).toEqual({
      ok: true,
      value: { household_id: HID, email: 'alex@example.com', password: 'candycane' },
    });
  });

  it('keeps the password exactly as typed', () => {
    const r = validateAddPartner({ household_id: HID, email: 'a@b.co', password: ' spaced pw ' });
    expect(r.ok && r.value.password).toBe(' spaced pw ');
  });

  it('refuses bad emails, short or long passwords, and missing lists', () => {
    expect(validateAddPartner({ household_id: HID, email: 'not-an-email', password: 'candycane' }).ok).toBe(false);
    expect(validateAddPartner({ household_id: HID, email: 'a@b.co', password: 'short' }).ok).toBe(false);
    expect(validateAddPartner({ household_id: HID, email: 'a@b.co', password: 'x'.repeat(73) }).ok).toBe(false);
    expect(validateAddPartner({ household_id: 'nope', email: 'a@b.co', password: 'candycane' }).ok).toBe(false);
    expect(validateAddPartner(null).ok).toBe(false);
    expect(validateAddPartner({ household_id: HID, email: 5, password: 'candycane' }).ok).toBe(false);
  });
});
