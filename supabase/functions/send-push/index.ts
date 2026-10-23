// Supabase Edge Function: sends push notifications to the household's phones.
//   POST /functions/v1/send-push  { kind: 'test' }
//     A signed-in member pings only their own phones (the "Send test" button).
//   POST ... { kind: 'activity', ... }   from the gifts trigger (shared secret)
//     Tells the partner what changed, and warns both when the budget is passed.
//   POST ... { kind: 'countdown' }        from the daily job (shared secret)
//     Christmas countdown on milestone days.
//
// The VAPID private key, the shared push secret and the service role key only
// exist here, in Supabase's own function environment, never in the app.
// Deployed with verify_jwt off so the browser's CORS preflight gets through;
// the checks below do the gatekeeping.

import webpush from 'npm:web-push@3.6.7';
import { sameSecret } from './auth.ts';
import {
  activityMessage,
  budgetAction,
  budgetMessage,
  countdownMessage,
  daysUntilChristmas,
  isMilestone,
  leftToSpend,
  type GiftRow,
  type Message,
} from './rules.ts';

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
// Secrets pasted into a dashboard often carry stray spaces or line breaks.
// The keys are base64 text with no whitespace, so every bit of it can go.
const VAPID_PUBLIC = (Deno.env.get('VAPID_PUBLIC_KEY') ?? '').replace(/\s+/g, '');
const VAPID_PRIVATE = (Deno.env.get('VAPID_PRIVATE_KEY') ?? '').replace(/\s+/g, '');
const PUSH_SECRET = (Deno.env.get('PUSH_SECRET') ?? '').trim();
const VAPID_SUBJECT = (Deno.env.get('VAPID_SUBJECT') ?? '').trim() || 'mailto:gon3tom@gmail.com';

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
async function send(subs: Sub[], payload: Message): Promise<number> {
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Member {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await rest(path);
  return (await res.json()) as T;
}

const memberName = (m: Member | undefined) => m?.display_name || m?.email?.split('@')[0] || 'Your partner';

const subsFor = (householdId: string, exceptUser?: string | null) =>
  getJson<(Sub & { user_id: string })[]>(`push_subscriptions?household_id=eq.${householdId}&select=endpoint,p256dh,auth,user_id`).then(
    (all) => (Array.isArray(all) ? all.filter((s) => s.user_id !== exceptUser) : []),
  );

const giftsOf = (householdId: string) => getJson<GiftRow[]>(`gifts?household_id=eq.${householdId}&select=status,estimate,paid`);

/** A new gift or status change tells the partner; passing the budget warns both. */
async function handleActivity(b: Record<string, unknown>): Promise<Response> {
  const householdId = String(b.household_id ?? '');
  const actor = b.actor ? String(b.actor) : null;
  if (!UUID.test(householdId) || (actor && !UUID.test(actor))) return reply({ error: 'Bad request' }, 400);

  const members = await getJson<Member[]>(`household_members?household_id=eq.${householdId}&select=user_id,display_name,email`);
  const message = activityMessage({
    actor: memberName(members.find((m) => m.user_id === actor)),
    op: String(b.op ?? ''),
    giftName: String(b.gift_name ?? 'a gift').slice(0, 80),
    personName: b.person_name ? String(b.person_name).slice(0, 60) : null,
    oldStatus: b.old_status ? String(b.old_status) : null,
    newStatus: String(b.new_status ?? 'idea'),
  });
  let delivered = 0;
  if (message) delivered += await send(await subsFor(householdId, actor), message);

  const [household] = await getJson<{ budget: number | string; over_budget_notified: boolean }[]>(
    `households?id=eq.${householdId}&select=budget,over_budget_notified`,
  );
  if (household) {
    const left = leftToSpend(household.budget, await giftsOf(householdId));
    const action = budgetAction(left, household.over_budget_notified, Number(household.budget) > 0);
    if (action !== 'none') {
      await rest(`households?id=eq.${householdId}`, {
        method: 'PATCH',
        body: JSON.stringify({ over_budget_notified: action === 'alert' }),
      });
    }
    if (action === 'alert') delivered += await send(await subsFor(householdId), budgetMessage(left));
  }
  return reply({ delivered });
}

/** The daily job: on milestone days every household hears the countdown. */
async function handleCountdown(): Promise<Response> {
  const days = daysUntilChristmas(new Date());
  if (!isMilestone(days)) return reply({ skipped: true, days });
  const households = await getJson<{ id: string }[]>('households?select=id');
  let delivered = 0;
  for (const h of households) {
    const subs = await subsFor(h.id);
    if (subs.length === 0) continue;
    delivered += await send(subs, countdownMessage(days, await giftsOf(h.id)));
  }
  return reply({ delivered, days });
}

/** The test button: a real countdown message, so you see what the daily one looks like. */
async function handleTest(req: Request): Promise<Response> {
  const me = await callerId(req);
  if (!me) return reply({ error: 'Sign in first' }, 401);
  const subs = await getJson<Sub[]>(`push_subscriptions?user_id=eq.${me}&select=endpoint,p256dh,auth`);
  if (!Array.isArray(subs) || subs.length === 0) return reply({ error: 'Turn notifications on for this phone first.' }, 400);
  const [mine] = await getJson<{ household_id: string }[]>(`household_members?user_id=eq.${me}&select=household_id`);
  const gifts = mine ? await giftsOf(mine.household_id) : [];
  const preview = countdownMessage(daysUntilChristmas(new Date()), gifts);
  return reply({ delivered: await send(subs, { title: 'Test notification', body: `This is how the countdown looks: ${preview.title}. ${preview.body}` }) });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return reply({ error: 'Use POST' }, 405);
  const missing = [
    !VAPID_PUBLIC && 'VAPID_PUBLIC_KEY',
    !VAPID_PRIVATE && 'VAPID_PRIVATE_KEY',
    (!SUPABASE_URL || !SERVICE_KEY) && 'the Supabase keys',
  ].filter(Boolean);
  if (missing.length > 0) {
    return reply({ error: `Notifications are not set up on the server yet. Missing: ${missing.join(', ')}.` }, 500);
  }
  // A real public key is 87 characters and a private key 43; lengths only, never the values.
  const sizes = `public key ${VAPID_PUBLIC.length} characters, private key ${VAPID_PRIVATE.length}`;

  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (body.kind === 'test') return await handleTest(req);

    if (body.kind === 'activity' || body.kind === 'countdown') {
      // Only the database (trigger and daily job) knows this secret.
      if (!sameSecret(req.headers.get('x-push-secret') ?? '', PUSH_SECRET)) return reply({ error: 'Not allowed' }, 401);
      return body.kind === 'activity' ? await handleActivity(body) : await handleCountdown();
    }
    return reply({ error: 'Unknown request' }, 400);
  } catch (err) {
    const reason = err instanceof Error ? err.message.slice(0, 120) : 'unknown';
    return reply({ error: `Could not send that right now (${reason}; ${sizes}).` }, 500);
  }
});
