import { describe, expect, it } from 'vitest';
import { isNewFromPartner } from './newness';

const seen = '2026-10-20T12:00:00Z';

describe('isNewFromPartner', () => {
  it('flags a partner change made after I last looked', () => {
    expect(isNewFromPartner({ updated_by: 'sam', updated_at: '2026-10-21T08:00:00Z' }, 'me', seen)).toBe(true);
  });
  it('ignores my own changes', () => {
    expect(isNewFromPartner({ updated_by: 'me', updated_at: '2026-10-21T08:00:00Z' }, 'me', seen)).toBe(false);
  });
  it('ignores changes from before I last looked', () => {
    expect(isNewFromPartner({ updated_by: 'sam', updated_at: '2026-10-19T08:00:00Z' }, 'me', seen)).toBe(false);
  });
  it('flags nothing on a first visit', () => {
    expect(isNewFromPartner({ updated_by: 'sam', updated_at: '2026-10-21T08:00:00Z' }, 'me', null)).toBe(false);
  });
  it('ignores gifts with no known editor', () => {
    expect(isNewFromPartner({ updated_by: null, updated_at: '2026-10-21T08:00:00Z' }, 'me', seen)).toBe(false);
  });
});
