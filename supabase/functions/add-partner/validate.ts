// Checks for the add-partner request. Shared by the Edge Function and tests.

export interface AddPartnerInput {
  household_id: string;
  email: string;
  password: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const MIN_PASSWORD = 8;
export const MAX_MEMBERS = 2;

/** Returns the cleaned input, or a message saying what's wrong. */
export function validateAddPartner(body: unknown): { ok: true; value: AddPartnerInput } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Missing details.' };
  const b = body as Record<string, unknown>;
  const household_id = typeof b.household_id === 'string' ? b.household_id.trim() : '';
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  if (!UUID.test(household_id)) return { ok: false, error: 'Missing list.' };
  if (!EMAIL.test(email) || email.length > 254) return { ok: false, error: 'That email address does not look right.' };
  if (password.length < MIN_PASSWORD) return { ok: false, error: `Use a password of at least ${MIN_PASSWORD} characters.` };
  if (password.length > 72) return { ok: false, error: 'That password is too long (72 characters at most).' };
  return { ok: true, value: { household_id, email, password } };
}
