// Link preview logic shared by the Supabase Edge Function (index.ts) and the tests.
// No Node or Deno APIs here: DNS lookup is passed in with setResolver().

/** Returns the host's IP addresses, or null when DNS lookup isn't available. */
export type Resolver = (host: string) => Promise<string[] | null>;

let resolver: Resolver = async () => null;

export function setResolver(r: Resolver) {
  resolver = r;
}

export function ipVersion(text: string): 0 | 4 | 6 {
  if (/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(text)) return 4;
  if (text.includes(':') && /^[0-9a-f:.]+$/i.test(text)) return 6;
  return 0;
}

const MAX_HTML_BYTES = 600_000;
const MAX_IMAGE_BYTES = 5_000_000;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

export function isPrivateIp(ip: string): boolean {
  if (ipVersion(ip) === 4) {
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
  const addrs = ipVersion(host) ? [host] : await resolver(host);
  if (addrs === null) return url; // no DNS lookup on this runtime: literal IPs and names above are still checked
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a))) throw new Error('private address');
  return url;
}

/** Fetches with redirects followed by hand, so every hop is checked. */
export async function safeFetch(raw: string, accept: string): Promise<Response> {
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

export async function readLimited(res: Response, limit: number): Promise<Uint8Array> {
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

export interface Preview {
  title: string | null;
  image: string | null;
  site: string | null;
}

const EMPTY: Preview = { title: null, image: null, site: null };

/** Reads a page's title, picture and site name. Never throws. */
export async function getPreview(pageUrl: string): Promise<Preview> {
  try {
    const res = await safeFetch(pageUrl, 'text/html,application/xhtml+xml');
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.includes('html')) return EMPTY;
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
    return { title: title?.slice(0, 200) ?? null, image, site: site?.slice(0, 80) ?? null };
  } catch {
    return EMPTY;
  }
}

/** Downloads a picture (max 5 MB). Returns null if it isn't a usable image. */
export async function getImage(imageUrl: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const res = await safeFetch(imageUrl, 'image/avif,image/webp,image/png,image/jpeg,image/*');
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !/^image\/(jpeg|png|webp|gif|avif)/.test(type)) return null;
    const bytes = await readLimited(res, MAX_IMAGE_BYTES + 1);
    if (bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return { bytes, type };
  } catch {
    return null;
  }
}
