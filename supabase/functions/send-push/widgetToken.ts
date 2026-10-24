// A widget link carries the person's id and a signature only the server can make,
// so it can't be guessed or edited. Signed with the server's push secret.

const enc = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(userId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(await crypto.subtle.sign('HMAC', key, enc.encode(`widget:${userId}`)));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function same(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function makeWidgetToken(userId: string, secret: string): Promise<string> {
  return `${userId}.${await sign(userId, secret)}`;
}

/** The person's id when the token is genuine, otherwise null. */
export async function checkWidgetToken(token: string | null, secret: string): Promise<string | null> {
  if (!token || !secret) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const userId = token.slice(0, dot);
  if (!UUID.test(userId)) return null;
  return same(token.slice(dot + 1), await sign(userId, secret)) ? userId : null;
}
