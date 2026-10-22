// Vercel function: GET /api/link-preview?url=...   → { title, image, site }
//                  GET /api/link-preview?image=... → the picture's bytes
//
// Browsers can't read other sites' pages, so this fetches them for the app.
// Only signed-in users may call it, and it refuses private/internal addresses.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_HTML_BYTES = 600_000;
const MAX_IMAGE_BYTES = 5_000_000;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=3600' },
  });

async function isSignedIn(request: Request): Promise<boolean> {
  const auth = request.headers.get('authorization');
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!auth?.startsWith('Bearer ') || !url || !key) return false;
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { authorization: auth, apikey: key },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return (
    v6 === '::' || v6 === '::1' ||
    v6.startsWith('fc') || v6.startsWith('fd') ||
    v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb') ||
    v6.startsWith('ff')
  );
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('bad protocol');
  if (url.username || url.password) throw new Error('credentials in url');
  if (url.port && url.port !== '80' && url.port !== '443') throw new Error('bad port');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) throw new Error('private host');
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new Error('private address');
  return url;
}

/** Fetches with redirects followed by hand, so every hop is checked. */
async function safeFetch(raw: string, accept: string): Promise<Response> {
  let current = raw;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        accept,
        'user-agent': 'Mozilla/5.0 (compatible; GiftListPreview/1.0)',
        'accept-language': 'en-US,en;q=0.8',
      },
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, url).toString();
      continue;
    }
    return res;
  }
  throw new Error('too many redirects');
}

async function readLimited(res: Response, limit: number): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  if (size >= limit) await reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(size, limit));
  let offset = 0;
  for (const c of chunks) {
    const part = c.subarray(0, out.length - offset);
    out.set(part, offset);
    offset += part.byteLength;
    if (offset >= out.length) break;
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function metaContent(html: string, names: string[]): string | null {
  for (const name of names) {
    const esc = name.replace(/[.:]/g, '\\$&');
    const a = new RegExp(`<meta[^>]+(?:property|name)=["']${esc}["'][^>]*content=["']([^"']+)["']`, 'i').exec(html);
    const b = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${esc}["']`, 'i').exec(html);
    const hit = a?.[1] ?? b?.[1];
    if (hit) return decodeEntities(hit);
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  if (!(await isSignedIn(request))) return json({ error: 'Sign in first' }, 401);

  const params = new URL(request.url).searchParams;
  const pageUrl = params.get('url');
  const imageUrl = params.get('image');

  try {
    if (imageUrl) {
      const res = await safeFetch(imageUrl, 'image/avif,image/webp,image/png,image/jpeg,image/*');
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || !/^image\/(jpeg|png|webp|gif|avif)/.test(type)) return json({ error: 'Not a picture' }, 422);
      const bytes = await readLimited(res, MAX_IMAGE_BYTES + 1);
      if (bytes.byteLength > MAX_IMAGE_BYTES) return json({ error: 'Picture too big' }, 413);
      return new Response(bytes.buffer as ArrayBuffer, {
        headers: { 'content-type': type, 'cache-control': 'private, max-age=3600' },
      });
    }

    if (!pageUrl) return json({ error: 'Missing url' }, 400);
    const res = await safeFetch(pageUrl, 'text/html,application/xhtml+xml');
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.includes('html')) return json({ title: null, image: null, site: null });

    const html = new TextDecoder().decode(await readLimited(res, MAX_HTML_BYTES));
    const titleTag = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)?.[1];
    const title = metaContent(html, ['og:title', 'twitter:title']) ?? (titleTag ? decodeEntities(titleTag) : null);
    const rawImage = metaContent(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']);
    let image: string | null = null;
    if (rawImage) {
      try {
        image = new URL(rawImage, res.url || pageUrl).toString();
      } catch {
        image = null;
      }
    }
    const site = metaContent(html, ['og:site_name', 'application-name']);
    return json({ title: title?.slice(0, 200) ?? null, image, site: site?.slice(0, 80) ?? null });
  } catch {
    // Unreachable, blocked, or private: the app falls back to typing the name.
    return json({ title: null, image: null, site: null });
  }
}
