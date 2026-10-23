import { supabase } from './supabase';

// The public half of the notification key. Safe to ship; the private half only
// exists in Supabase's function environment.
const VAPID_PUBLIC =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ??
  'BK3naRunDdKdtnnR2KgyXrymnPTu86lQFig712w6kWqOlngjx9GghH7g948ocYB2lKXdAAJ3-UWdWf43esST9gQ';

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }).catch(() => {});
  });
}

function isInstalled(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function canPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function pushState(): Promise<PushState> {
  if (!canPush()) return isInstalled() ? 'unsupported' : 'needs-install';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Asks permission and saves this phone's push address. Must run from a tap. */
export async function enablePush(householdId: string, userId: string): Promise<void> {
  if (!canPush()) throw new Error('Notifications need the Gift-List app on your Home Screen.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications are blocked. Turn them on in your phone settings.');
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }));
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error('This phone could not be set up for notifications.');
  await supabase.from('push_subscriptions').delete().eq('endpoint', json.endpoint);
  const res = await supabase
    .from('push_subscriptions')
    .insert({ household_id: householdId, user_id: userId, endpoint: json.endpoint, p256dh, auth });
  if (res.error) throw new Error(res.error.message);
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/** Asks the server to send this member's phones a test notification. */
export async function sendTestPush(): Promise<void> {
  const { data: auth } = await supabase.auth.getSession();
  const token = auth.session?.access_token;
  if (!token) throw new Error('Sign in first.');
  let res: Response;
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ kind: 'test' }),
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? 'Could not send the test notification.');
}
