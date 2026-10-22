// Supabase Edge Function: link previews for Gift-List.
//   GET /functions/v1/link-preview?url=...   → { title, image, site }
//   GET /functions/v1/link-preview?image=... → the picture's bytes
//
// Browsers can't read other sites' pages, so this fetches them for the app.
// Only signed-in users may call it, and it refuses private/internal addresses
// on every redirect hop. Deployed with verify_jwt off so the browser's CORS
// preflight gets through; the sign-in check below does the real gatekeeping.

import { getImage, getPreview, setResolver } from './preview.ts';

declare const Deno: {
  env: { get(name: string): string | undefined };
  resolveDns(host: string, type: 'A' | 'AAAA'): Promise<string[]>;
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

setResolver(async (host) => {
  if (typeof Deno.resolveDns !== 'function') return null;
  const [v4, v6] = await Promise.all([
    Deno.resolveDns(host, 'A').catch(() => [] as string[]),
    Deno.resolveDns(host, 'AAAA').catch(() => [] as string[]),
  ]);
  return [...v4, ...v6];
});

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'private, max-age=3600' },
  });

async function isSignedIn(req: Request): Promise<boolean> {
  const auth = req.headers.get('authorization');
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  if (!auth?.startsWith('Bearer ') || !url || !key) return false;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { authorization: auth, apikey: key },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const user = (await res.json()) as { id?: string };
    return Boolean(user.id);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'GET') return json({ error: 'Use GET' }, 405);
  if (!(await isSignedIn(req))) return json({ error: 'Sign in first' }, 401);

  const params = new URL(req.url).searchParams;
  const imageUrl = params.get('image');
  if (imageUrl) {
    const img = await getImage(imageUrl);
    if (!img) return json({ error: 'Not a usable picture' }, 422);
    return new Response(img.bytes.buffer as ArrayBuffer, {
      headers: { ...CORS, 'content-type': img.type, 'cache-control': 'private, max-age=3600' },
    });
  }

  const pageUrl = params.get('url');
  if (!pageUrl) return json({ error: 'Missing url' }, 400);
  return json(await getPreview(pageUrl));
});
