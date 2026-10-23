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
const MAX_REDIRECTS = 5; // a.co short links hop a few times

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
        // A normal phone browser identity: some shops (Amazon) refuse unknown bots.
        'user-agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
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
  /** US dollars as a plain amount, e.g. "89.99". Goes into the gift's estimate. */
  price: string | null;
}

const EMPTY: Preview = { title: null, image: null, site: null, price: null };

// ---------------------------------------------------------------------------
// Amazon: product pages have no og:image, and Amazon often answers automated
// requests with a "robot check" page. Fall back to the product code (ASIN).
// ---------------------------------------------------------------------------

export function isAmazon(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return /(^|\.)amazon\.[a-z.]+$/.test(host) || host === 'a.co' || host === 'amzn.to' || host === 'amzn.com';
  } catch {
    return false;
  }
}

/** The 10-character product code from an Amazon product link, if any. */
export function amazonAsin(url: string): string | null {
  const m = /\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin|o\/ASIN)\/([A-Z0-9]{10})(?=[/?#]|$)/i.exec(url);
  return m ? m[1].toUpperCase() : null;
}

/** Amazon's public product-image address for a product code. */
export function amazonImageForAsin(asin: string): string {
  return `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.L.jpg`;
}

/** "Some-Product-Name/dp/B0…" → "Some Product Name". */
function amazonTitleFromUrl(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const i = parts.findIndex((p) => p === 'dp' || p === 'gp');
    const slug = i > 0 ? parts[i - 1] : null;
    if (!slug || slug.length < 4) return null;
    return decodeURIComponent(slug).replace(/[-_]+/g, ' ').trim() || null;
  } catch {
    return null;
  }
}

/** Asks Amazon's image server for a bigger copy: "…._AC_SX38_.jpg" → "…._AC_SL1000_.jpg". */
export function largerAmazonImage(url: string): string {
  return url.replace(/\._[^/]*?_\.(jpe?g|png|webp)$/i, '._AC_SL1000_.$1');
}

/** Finds the main product photo in Amazon's page markup (desktop or phone layout). */
function amazonImageFromHtml(html: string): string | null {
  const attr = (re: RegExp) => {
    const hit = re.exec(html)?.[1];
    return hit ? decodeEntities(hit) : null;
  };
  // Desktop: <img id="landingImage" data-old-hires="…" data-a-dynamic-image="{&quot;…&quot;:[…]}">
  const found =
    attr(/data-old-hires=["'](https:\/\/[^"']+)["']/i) ??
    attr(/data-a-dynamic-image=["']\{\s*(?:&quot;|")(https:\/\/[^"&]+)(?:&quot;|")/i) ??
    // Phone: <img id="main-image" data-a-hires="…" src="…">
    attr(/data-a-hires=["'](https:\/\/[^"']+)["']/i) ??
    attr(/<img[^>]+id=["'](?:main-image|landingImage|imgBlkFront)["'][^>]*\ssrc=["'](https:\/\/[^"']+)["']/i) ??
    attr(/<img[^>]+\ssrc=["'](https:\/\/[^"']+)["'][^>]*id=["'](?:main-image|landingImage|imgBlkFront)["']/i) ??
    /"hiRes"\s*:\s*"(https:\/\/[^"]+)"/.exec(html)?.[1] ??
    /"large"\s*:\s*"(https:\/\/[^"]+)"/.exec(html)?.[1] ??
    // Last resort: the first product photo on the page (Amazon keeps those under /images/I/).
    /(https:\/\/(?:m\.media-amazon\.com|images-[a-z]+\.ssl-images-amazon\.com)\/images\/I\/[A-Za-z0-9+%-]+(?:\.[^"'\s,)]*?)?\.(?:jpe?g|png|webp))/i.exec(html)?.[1] ??
    null;
  return found ? largerAmazonImage(found) : null;
}

/** "Amazon.com: LEGO Treehouse : Toys & Games" → "LEGO Treehouse". */
function cleanAmazonTitle(title: string): string {
  return title
    .replace(/^amazon\.[a-z.]+\s*[:|-]\s*/i, '')
    .replace(/\s*:\s*[^:]{2,40}$/, '')
    .trim();
}

const BLOCKED_TITLE = /^(amazon\.[a-z.]+|robot check|sorry! something went wrong!?|page not found|access denied)$/i;

// ---------------------------------------------------------------------------
// Generic fallbacks: <link rel="image_src"> and JSON-LD "image".
// ---------------------------------------------------------------------------

function linkImage(html: string): string | null {
  const a = /<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1];
  const b = /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']image_src["']/i.exec(html)?.[1];
  return a ?? b ?? null;
}

function jsonLdImage(html: string): string | null {
  // "image": "…", "image": ["…"], or "image": {"url": "…"}; links may be written https:\/\/…
  const m = /"image"\s*:\s*(?:\[\s*)?(?:\{[^}]*?"url"\s*:\s*)?"(https?:(?:\\?\/){2}[^"]+)"/.exec(html);
  return m ? m[1].replace(/\\\//g, '/') : null;
}

// ---------------------------------------------------------------------------
// Price: shops put it in different places. Only US dollars are used.
// ---------------------------------------------------------------------------

/** "$1,299.99" → "1299.99"; null unless it's a sensible amount. */
export function normalizePrice(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = decodeEntities(String(raw)).replace(/^\s*(?:US)?\$\s*/i, '').replace(/,/g, '').trim();
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  if (!(value > 0 && value < 100_000)) return null;
  return value.toFixed(2);
}

function notUsd(currency: string | null | undefined): boolean {
  return Boolean(currency && currency.trim().toUpperCase() !== 'USD');
}

function amazonPrice(html: string): string | null {
  const twister = /id=["']twister-plus-price-data-price["'][^>]*value=["']([^"']+)["']/i.exec(html)?.[1];
  const fromTwister = normalizePrice(twister);
  if (fromTwister) return fromTwister;
  const amount = normalizePrice(/"priceAmount"\s*:\s*"?([\d.,]+)"?/.exec(html)?.[1]);
  if (amount) return amount;
  // The price you'd pay sits in the core price block (desktop or mobile).
  for (const marker of ['priceToPay', 'corePrice', 'apex_desktop', 'apex_offerDisplay']) {
    const at = html.indexOf(marker);
    if (at === -1) continue;
    const span = /<span class=["']a-offscreen["']>\s*([^<]+?)\s*<\/span>/i.exec(html.slice(at, at + 4000))?.[1];
    const found = normalizePrice(span);
    if (found) return found;
  }
  return null;
}

/** Price from the Product (or its offers) inside JSON-LD script blocks. */
function jsonLdPrice(html: string): string | null {
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) ?? [];
  const found: string[] = [];
  const walk = (node: unknown, inProduct: boolean) => {
    if (Array.isArray(node)) return node.forEach((n) => walk(n, inProduct));
    if (!node || typeof node !== 'object') return;
    const o = node as Record<string, unknown>;
    const type = JSON.stringify(o['@type'] ?? '');
    const product = inProduct || /Product/i.test(type);
    if (product && /Offer/i.test(type) && !notUsd(String(o.priceCurrency ?? ''))) {
      const v = normalizePrice(String(o.price ?? o.lowPrice ?? ''));
      if (v) found.push(v);
    }
    for (const v of Object.values(o)) walk(v, product);
  };
  for (const block of blocks) {
    try {
      walk(JSON.parse(block.replace(/^<script[^>]*>|<\/script>$/gi, '')), false);
    } catch {
      /* ignore malformed block */
    }
    if (found.length) break;
  }
  return found[0] ?? null;
}

export function findPrice(html: string, amazon: boolean): string | null {
  if (!html) return null;
  if (amazon) {
    const a = amazonPrice(html);
    if (a) return a;
  }
  // Meta tags (Shopify and many shops)
  const metaCurrency = metaContent(html, ['product:price:currency', 'og:price:currency']);
  if (!notUsd(metaCurrency)) {
    const meta = normalizePrice(metaContent(html, ['product:price:amount', 'og:price:amount']));
    if (meta) return meta;
  }
  // Microdata: itemprop="price" content="…"
  const micro =
    /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1] ??
    /content=["']([^"']+)["'][^>]*itemprop=["']price["']/i.exec(html)?.[1];
  const microCurrency = /itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i.exec(html)?.[1];
  if (!notUsd(microCurrency)) {
    const m = normalizePrice(micro);
    if (m) return m;
  }
  // Shops that embed their own page state (Best Buy): the price you pay now.
  if (/bestbuy\./i.test(html.slice(0, 200000)) || /"customerPrice"|"currentPrice"/.test(html)) {
    const state = normalizePrice(/"(?:customerPrice|currentPrice)"\s*:\s*"?(\$?[\d.,]+)"?/.exec(html)?.[1]);
    if (state) return state;
  }
  // JSON-LD: read the Product block's offer, not the first "price" on the page
  // (that can belong to a related item or a protection plan).
  const ld = jsonLdPrice(html);
  if (ld) return ld;
  // Bare JSON without a script wrapper: fall back to the first offer price.
  const ldCurrency = /"priceCurrency"\s*:\s*"([A-Za-z]{3})"/.exec(html)?.[1];
  if (!notUsd(ldCurrency)) {
    const bare = normalizePrice(/"(?:price|lowPrice)"\s*:\s*"?(\$?[\d.,]+)"?/.exec(html)?.[1]);
    if (bare) return bare;
  }
  return null;
}

function absolute(raw: string | null, base: string): string | null {
  if (!raw) return null;
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

/**
 * Turns a fetched page into a preview. `finalUrl` is the address after
 * redirects (a.co short links end up on amazon.com/dp/…).
 */
export function parsePreview(html: string, finalUrl: string): Preview {
  const titleTag = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)?.[1];
  let title = metaContent(html, ['og:title', 'twitter:title', 'title']) ?? (titleTag ? decodeEntities(titleTag) : null);
  let image = absolute(
    metaContent(html, ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) ??
      linkImage(html) ??
      jsonLdImage(html),
    finalUrl,
  );
  let site = metaContent(html, ['og:site_name', 'application-name']);
  const price = findPrice(html, isAmazon(finalUrl));

  if (isAmazon(finalUrl)) {
    site = 'Amazon';
    image = image ?? absolute(amazonImageFromHtml(html), finalUrl);
    const asin = amazonAsin(finalUrl);
    if (!image && asin) image = amazonImageForAsin(asin);
    if (title) title = cleanAmazonTitle(title);
    if (!title || BLOCKED_TITLE.test(title)) title = amazonTitleFromUrl(finalUrl);
  }

  return { title: title?.slice(0, 200) || null, image, site: site?.slice(0, 80) ?? null, price };
}

/** Reads a page's title, picture and site name. Never throws. */
export async function getPreview(pageUrl: string): Promise<Preview> {
  try {
    const res = await safeFetch(pageUrl, 'text/html,application/xhtml+xml');
    const finalUrl = res.url || pageUrl;
    const type = res.headers.get('content-type') ?? '';
    // Blocked or not HTML: an Amazon link can still give us its picture.
    if (!res.ok || !type.includes('html')) return isAmazon(finalUrl) ? parsePreview('', finalUrl) : EMPTY;
    const html = new TextDecoder().decode(await readLimited(res, MAX_HTML_BYTES));
    return parsePreview(html, finalUrl);
  } catch {
    // Unreachable or timed out: a full Amazon product link still has its code.
    return isAmazon(pageUrl) ? parsePreview('', pageUrl) : EMPTY;
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
    if (bytes.byteLength < 1000) return null; // a 1×1 "no image" placeholder
    return { bytes, type };
  } catch {
    return null;
  }
}
