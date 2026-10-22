import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Only the public anon key belongs in the browser. Never the service role key.
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isConfigured = Boolean(url && anonKey);

/**
 * A sign-in link that failed (expired, already used) comes back with
 * error details in the address. Read them before Supabase tidies the URL,
 * then clear them so a reload doesn't show the message again.
 */
function readLinkError(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = params.get('error_code') ?? hash.get('error_code');
  const description = params.get('error_description') ?? hash.get('error_description');
  if (!code && !description) return null;
  window.history.replaceState(null, '', window.location.pathname);
  if (code === 'otp_expired' || /expired|invalid/i.test(description ?? '')) {
    return 'That sign-in link has expired or was already used. Request a new one below.';
  }
  return description ?? 'That sign-in link did not work. Request a new one below.';
}

export const linkError = readLinkError();

export const supabase: SupabaseClient = createClient(
  url || 'http://localhost:54321',
  anonKey || 'missing-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Implicit flow: the link carries the sign-in in its # part, so it works
      // in whichever browser opens it (Gmail, Mail, Safari, an in-app browser).
      // PKCE only works in the browser that asked for the link.
      flowType: 'implicit',
    },
  },
);

export const PHOTO_BUCKET = 'gift-photos';

/** Friendly text for an error from Supabase or the network. */
export function errorText(err: unknown): string {
  if (!err) return 'Something went wrong.';
  if (typeof err === 'string') return err;
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
  const message = typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : '';
  if (code === 'over_email_send_rate_limit' || /rate limit|only request this after/i.test(message)) {
    return 'Too many sign-in emails were sent recently. Please wait a few minutes and try again.';
  }
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && 'message' in err && typeof err.message === 'string') return err.message;
  return 'Something went wrong.';
}
