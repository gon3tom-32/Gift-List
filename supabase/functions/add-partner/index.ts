// Supabase Edge Function: the list owner creates their partner's login.
//   POST /functions/v1/add-partner  { household_id, email, password }
//
// Creating an already-confirmed account needs the service role key. It only
// exists here, in Supabase's own function environment, never in the app.
// Deployed with verify_jwt off so the browser's CORS preflight gets through;
// the checks below do the gatekeeping:
//   1. the caller is signed in
//   2. the caller owns the household
//   3. the household has room (two members at launch)

import { MAX_MEMBERS, validateAddPartner } from './validate.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const admin = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' };

async function callerId(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { authorization: auth, apikey: ANON_KEY },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string };
  return user.id ?? null;
}

async function rest(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...admin, ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(8000),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return reply({ error: 'The server is not set up for this yet.' }, 500);

  try {
    const me = await callerId(req);
    if (!me) return reply({ error: 'Sign in first.' }, 401);

    const checked = validateAddPartner(await req.json().catch(() => null));
    if (!checked.ok) return reply({ error: checked.error }, 400);
    const { household_id, email, password } = checked.value;

    // Only the owner can add someone, and only while there's room.
    const membersRes = await rest(`household_members?household_id=eq.${household_id}&select=user_id,role`);
    if (!membersRes.ok) return reply({ error: 'Could not check the list.' }, 500);
    const members = (await membersRes.json()) as { user_id: string; role: string }[];
    if (!members.some((m) => m.user_id === me && m.role === 'owner')) {
      return reply({ error: 'Only the person who created the list can add a partner.' }, 403);
    }
    if (members.length >= MAX_MEMBERS) {
      return reply({ error: 'Your list already has two people on it.' }, 409);
    }

    // Create the partner's account, already confirmed, with the chosen password.
    const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: admin,
      body: JSON.stringify({ email, password, email_confirm: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!created.ok) {
      const err = (await created.json().catch(() => ({}))) as { code?: string; error_code?: string; msg?: string; message?: string };
      const code = err.error_code ?? err.code ?? '';
      const text = err.msg ?? err.message ?? '';
      if (code === 'email_exists' || /already (been )?registered|already exists/i.test(text)) {
        // Never change an existing account's password. Fall back to an invite.
        await rest('household_invites?on_conflict=household_id,email', {
          method: 'POST',
          headers: { prefer: 'resolution=ignore-duplicates,return=minimal' },
          body: JSON.stringify({ household_id, email, invited_by: me }),
        });
        return reply(
          { error: "That email already has an account. Ask them to sign in with it; they'll join your list automatically." },
          409,
        );
      }
      if (code === 'weak_password' || /password/i.test(text)) {
        return reply({ error: 'Supabase says that password is too weak. Try a longer one.' }, 400);
      }
      return reply({ error: 'Could not create the account. Please try again.' }, 502);
    }
    const user = (await created.json()) as { id: string };

    // Add them to the list and close any pending invite for that email.
    const added = await rest('household_members?on_conflict=household_id,user_id', {
      method: 'POST',
      headers: { prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ household_id, user_id: user.id, role: 'editor', email }),
    });
    if (!added.ok) return reply({ error: 'The account was made, but adding it to your list failed. Try inviting that email.' }, 500);
    await rest(`household_invites?household_id=eq.${household_id}&email=eq.${encodeURIComponent(email)}&accepted_at=is.null`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ accepted_at: new Date().toISOString() }),
    });

    return reply({ ok: true, email });
  } catch {
    return reply({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
