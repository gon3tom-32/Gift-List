import { describe, expect, it } from 'vitest';
import { duplicateInput, giftToInput } from './gifts';
import type { Gift } from './types';

const gift: Gift = {
  id: 'g1',
  household_id: 'h1',
  person_id: 'p1',
  name: 'Lego set',
  store: 'Target',
  link: 'https://example.com/lego',
  photo_path: 'h1/p1/lego.jpg',
  estimate: 2500,
  paid: 2299,
  status: 'wrapped',
  assigned_to: 'u1',
  shared: true,
  ship_by: '2026-12-10',
  payment_method: 'Credit card',
  created_by: 'u1',
  updated_by: 'u1',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-02T00:00:00Z',
};

describe('giftToInput', () => {
  it('keeps everything, including the photo, status and money', () => {
    const input = giftToInput(gift);
    expect(input).toMatchObject({ photo_path: 'h1/p1/lego.jpg', status: 'wrapped', estimate: 2500, paid: 2299, shared: true });
    expect(input).not.toHaveProperty('id');
  });
});

describe('duplicateInput', () => {
  it('starts a fresh idea with no photo, payment or buyer', () => {
    const copy = duplicateInput(gift);
    expect(copy).toEqual({
      person_id: 'p1',
      name: 'Lego set',
      store: 'Target',
      link: 'https://example.com/lego',
      estimate: 2500,
      status: 'idea',
    });
  });
});
