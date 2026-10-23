// Supabase Edge Function: sends push notifications to the household's phones.
//   POST /functions/v1/send-push  { kind: 'test' }
//     A signed-in member pings only their own phones (the "Send test" button).
//
// The VAPID private key, the shared push secret and the service role key only
// exist here, in Supabase's own function environment, never in the app.
// Deployed with verify_jwt off so the browser's CORS preflight gets through;
// the checks below do the gatekeeping.

import webpush from 'npm:web-push@3.6.7';

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
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:gon3tom@gmail.com';

const admin = { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' };

interface Sub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

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
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: admin, signal: AbortSignal.timeout(8000) });
}

/** Sends one message to every phone; phones that no longer exist are forgotten. */
async function send(subs: Sub[], payload: { title: string; body: string }): Promise<number> {
  let delivered = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 3600 },
        );
        delivered++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'DELETE' });
        }
      }
    }),
  );
  return delivered;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    return reply({ error: 'Notifications are not set up on the server yet.' }, 500);
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  try {
    const body = (await req.json().catch(() => ({}))) as { kind?: string };
    if (body.kind !== 'test') return reply({ error: 'Unknown request' }, 400);

    const me = await callerId(req);
    if (!me) return reply({ error: 'Sign in first' }, 401);

    const res = await rest(`push_subscriptions?user_id=eq.${me}&select=endpoint,p256dh,auth`);
    const subs = (await res.json()) as Sub[];
    if (!Array.isArray(subs) || subs.length === 0) {
      return reply({ error: 'Turn notifications on for this phone first.' }, 400);
    }
    const delivered = await send(subs, { title: 'Gift-List', body: 'Notifications are working. Ho ho ho!' });
    return reply({ delivered });
  } catch {
    return reply({ error: 'Could not send that right now.' }, 500);
  }
});
