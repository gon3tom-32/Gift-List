// Reference script: makes the landing-page screenshots from the real app and a made-up family.
// See docs/landing-page.md. Not part of the build.
// Drives the real built app against a made-up household, no real data involved.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_PATH || 'playwright');
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4173/Gift-List/';
const OUT = process.env.OUT;
const SB = 'https://demo.supabase.co';
const HID = 'h-demo';
const ME = '00000000-0000-4000-8000-000000000001';
const PARTNER = '00000000-0000-4000-8000-000000000002';
const now = Date.now();
const ago = (h) => new Date(now - h * 3600e3).toISOString();

const groups = [
  ['g1', 'Our family', 'gift', '1200.00'],
  ['g2', 'Kids', 'star', '500.00'],
  ['g3', 'Pets', 'paw', '80.00'],
  ['g4', 'Coworkers', 'briefcase', '150.00'],
  ['g5', 'Friends', 'heart', '300.00'],
].map(([id, name, icon, budget], i) => ({ id, household_id: HID, name, icon, budget, sort_order: i, created_at: ago(900) }));

const people = [
  ['p1', 'g1', 'Mom', '250.00'],
  ['p2', 'g1', 'Dad', '200.00'],
  ['p3', 'g1', 'Grandma Rose', '150.00'],
  ['p4', 'g2', 'Emma', '200.00'],
  ['p5', 'g2', 'Noah', '200.00'],
  ['p6', 'g3', 'Biscuit', '60.00'],
  ['p7', 'g4', 'Priya', '40.00'],
  ['p8', 'g5', 'Sam', '75.00'],
  ['p9', 'g1', 'Uncle Ben', '100.00'],
].map(([id, group_id, name, budget]) => ({ id, household_id: HID, group_id, family_id: null, name, budget, photo_path: null, created_at: ago(800) }));

// [id, person, name, store, estimate, paid, status, photo, byPartner]
const giftRows = [
  ['k1', 'p1', 'Cozy cashmere scarf', 'Nordstrom', '89.00', '84.50', 'wrapped', 'scarf', false],
  ['k2', 'p1', 'Spa day voucher', 'Local spa', '120.00', null, 'idea', 'spa', true],
  ['k3', 'p2', 'Cast iron skillet', 'Target', '45.00', '39.99', 'shipped', 'pan', false],
  ['k4', 'p2', 'Mystery novel set', 'Amazon', '32.00', null, 'ordered', 'book', false],
  ['k5', 'p3', 'Hand-knit slippers', 'Etsy', '38.00', '38.00', 'given', 'slippers', false],
  ['k6', 'p4', 'Art supply kit', 'Michaels', '55.00', null, 'ordered', 'art', true],
  ['k7', 'p4', 'Wooden chess set', 'Target', '36.00', null, 'idea', 'game', false],
  ['k8', 'p5', 'Toy block tower set', 'Target', '79.99', '79.99', 'wrapped', 'lego', false],
  ['k9', 'p6', 'Squeaky bone trio', 'Chewy', '14.00', null, 'idea', 'bone', true],
  ['k10', 'p7', 'Desk plant', 'The Sill', '28.00', null, 'idea', 'plant', false],
  ['k11', 'p8', 'Noise-cancelling headphones', 'Best Buy', '149.00', null, 'idea', 'phones', true],
  ['k12', 'p9', 'BBQ sauce sampler', 'Williams Sonoma', '34.00', '34.00', 'given', 'sauce', false],
].map(([id, person_id, name, store, estimate, paid, status, photo, byPartner]) => ({
  id, household_id: HID, person_id, name, store, link: null,
  photo_path: `${HID}/gifts/${photo}.jpg`,
  estimate, paid, status, assigned_to: null, shared: false, ship_by: null, payment_method: null,
  created_by: byPartner ? PARTNER : ME,
  updated_by: byPartner ? PARTNER : ME,
  created_at: ago(byPartner ? 3 : 200),
  updated_at: ago(byPartner ? 3 : 100),
}));
// the box of four soaps shared between the kids' cousins
giftRows.push({
  id: 'k13', household_id: HID, person_id: 'p4', name: 'Soap set (box of 4)', store: 'Lush', link: null,
  photo_path: `${HID}/gifts/soap.jpg`, estimate: '48.00', paid: null, status: 'ordered', assigned_to: null,
  shared: true, ship_by: null, payment_method: null, created_by: ME, updated_by: ME, created_at: ago(60), updated_at: ago(60),
});
const recipients = ['p5', 'p3', 'p7'].map((person_id) => ({ gift_id: 'k13', person_id, household_id: HID }));

const members = [
  { user_id: ME, role: 'owner', email: 'alex@example.com', display_name: 'Alex', last_seen_at: ago(24) },
  { user_id: PARTNER, role: 'editor', email: 'jordan@example.com', display_name: 'Jordan', last_seen_at: ago(2) },
];
const household = { id: HID, name: 'Maple family', budget: '2500.00', photo_path: `${HID}/household/family.svg` };

const tables = {
  households: household,
  household_members: members,
  household_invites: [],
  gift_groups: groups,
  families: [],
  people,
  gifts: giftRows,
  gift_recipients: recipients,
  gift_events: [],
  push_subscriptions: [],
};

const PIC = {
  family: ['#d9f2e8', '#18806a', '<circle cx="70" cy="78" r="20" fill="#fff"/><circle cx="130" cy="78" r="20" fill="#fff"/><circle cx="100" cy="104" r="14" fill="#fff"/><path d="M40 160c0-26 14-40 30-40s30 14 30 40zM100 160c0-26 14-40 30-40s30 14 30 40z" fill="#fff"/>'],
  scarf: ['#f6c1cf', '#d94b5c', '<path d="M60 40h80v40c0 30-20 50-40 50s-40-20-40-50z" fill="#fff" opacity=".85"/><rect x="85" y="80" width="30" height="80" rx="8" fill="#fff"/>'],
  spa: ['#cdeee3', '#2bb59a', '<circle cx="100" cy="100" r="46" fill="#fff" opacity=".9"/><path d="M100 70c18 14 18 40 0 54-18-14-18-40 0-54z" fill="#2bb59a"/>'],
  pan: ['#dfe3ea', '#566176', '<circle cx="90" cy="105" r="45" fill="#2b3340"/><circle cx="90" cy="105" r="33" fill="#566176"/><rect x="130" y="97" width="46" height="14" rx="7" fill="#2b3340"/>'],
  book: ['#fde7ea', '#8a2f55', '<rect x="55" y="45" width="90" height="110" rx="8" fill="#fff"/><rect x="55" y="45" width="16" height="110" fill="#8a2f55"/><rect x="85" y="70" width="46" height="8" rx="4" fill="#8a2f55" opacity=".5"/><rect x="85" y="90" width="36" height="8" rx="4" fill="#8a2f55" opacity=".5"/>'],
  slippers: ['#fff1b8', '#d98a1c', '<ellipse cx="78" cy="110" rx="30" ry="46" fill="#fff"/><ellipse cx="124" cy="110" rx="30" ry="46" fill="#fff"/><ellipse cx="78" cy="88" rx="22" ry="18" fill="#d98a1c" opacity=".6"/><ellipse cx="124" cy="88" rx="22" ry="18" fill="#d98a1c" opacity=".6"/>'],
  art: ['#e3dcf7', '#6f52b8', '<rect x="50" y="60" width="100" height="80" rx="10" fill="#fff"/><circle cx="80" cy="100" r="12" fill="#d94b5c"/><circle cx="105" cy="92" r="12" fill="#2bb59a"/><circle cx="128" cy="104" r="12" fill="#f2b632"/>'],
  game: ['#d9e8f7', '#2f6fa8', '<rect x="48" y="56" width="104" height="88" rx="10" fill="#fff"/><rect x="62" y="70" width="34" height="34" rx="6" fill="#2f6fa8"/><rect x="104" y="96" width="34" height="34" rx="6" fill="#d94b5c"/>'],
  lego: ['#fde0d3', '#b4562c', '<rect x="50" y="85" width="100" height="60" rx="8" fill="#fff"/><circle cx="72" cy="78" r="10" fill="#fff"/><circle cx="100" cy="78" r="10" fill="#fff"/><circle cx="128" cy="78" r="10" fill="#fff"/><rect x="50" y="110" width="100" height="10" fill="#b4562c" opacity=".4"/>'],
  bone: ['#e4f3dc', '#2a7d4f', '<rect x="50" y="90" width="100" height="22" rx="11" fill="#fff"/><circle cx="52" cy="88" r="16" fill="#fff"/><circle cx="52" cy="114" r="16" fill="#fff"/><circle cx="148" cy="88" r="16" fill="#fff"/><circle cx="148" cy="114" r="16" fill="#fff"/>'],
  plant: ['#d7f0e0', '#18806a', '<path d="M100 120c-30-10-40-40-30-60 22 6 34 26 30 60zM100 120c30-10 40-40 30-60-22 6-34 26-30 60z" fill="#fff"/><rect x="72" y="118" width="56" height="44" rx="8" fill="#d94b5c"/>'],
  phones: ['#e0e6f2', '#3a4a7a', '<path d="M60 120v-20a40 40 0 0 1 80 0v20" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round"/><rect x="50" y="112" width="24" height="42" rx="10" fill="#fff"/><rect x="126" y="112" width="24" height="42" rx="10" fill="#fff"/>'],
  sauce: ['#fde3d3', '#c2452d', '<rect x="62" y="70" width="34" height="84" rx="8" fill="#fff"/><rect x="104" y="70" width="34" height="84" rx="8" fill="#fff"/><rect x="62" y="104" width="34" height="26" fill="#c2452d"/><rect x="104" y="104" width="34" height="26" fill="#f2b632"/>'],
  soap: ['#fbe3f0', '#b8426f', '<rect x="48" y="60" width="48" height="36" rx="12" fill="#fff"/><rect x="104" y="60" width="48" height="36" rx="12" fill="#fff"/><rect x="48" y="104" width="48" height="36" rx="12" fill="#fff"/><rect x="104" y="104" width="48" height="36" rx="12" fill="#fff"/>'],
};
function svg(key) {
  const [a, b, body] = PIC[key] ?? PIC.scarf;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="200" height="200" fill="url(#g)"/>${body}</svg>`;
}

const session = {
  access_token: 'x.' + Buffer.from(JSON.stringify({ sub: ME, exp: 4102444800, role: 'authenticated' })).toString('base64url') + '.y',
  refresh_token: 'demo',
  token_type: 'bearer',
  expires_in: 3600 * 24 * 365,
  expires_at: 4102444800,
  user: { id: ME, aud: 'authenticated', role: 'authenticated', email: 'alex@example.com', user_metadata: {}, app_metadata: {}, created_at: ago(900) },
};

const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

async function setup(page) {
  await page.route(`${SB}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.split('/').pop();
      return json(route, fn === 'accept_invites' ? null : null);
    }
    if (p.startsWith('/rest/v1/')) {
      const t = p.split('/').pop();
      if (t === 'household_members' && url.searchParams.get('select')?.startsWith('household_id')) return json(route, [{ household_id: HID, joined_at: ago(900) }]);
      const rows = tables[t] ?? [];
      const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      return json(route, single ? (Array.isArray(rows) ? rows[0] : rows) : rows);
    }
    if (req.method() === 'POST' && p.startsWith('/storage/v1/object/sign/')) {
      const path = decodeURIComponent(p.replace('/storage/v1/object/sign/gift-photos/', ''));
      return json(route, { signedURL: `/object/sign/gift-photos/${encodeURI(path)}?token=demo` });
    }
    if (p.startsWith('/storage/v1/object/')) {
      const file = decodeURIComponent(p).split('/').pop();
      if (file.endsWith('.jpg')) return route.fulfill({ status: 200, contentType: 'image/jpeg', headers: { 'access-control-allow-origin': '*' }, body: (await import('node:fs')).readFileSync(new URL('./photos/' + file, import.meta.url)) });
      const key = file.replace('.svg', '');
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', headers: { 'access-control-allow-origin': '*' }, body: svg(key) });
    }
    if (p.startsWith('/functions/v1/link-preview')) {
      return json(route, { title: 'Cast iron skillet, 10 inch', image: null, store: 'Target' });
    }
    return json(route, {});
  });
  await page.addInitScript(([s]) => {
    localStorage.setItem('sb-demo-auth-token', JSON.stringify(s));
  }, [session]);
}

async function shot(page, name, hash, prep) {
  await page.goto(BASE + hash, { waitUntil: 'networkidle' });
  if (hash) await page.evaluate((h) => { location.hash = h.replace(/^#/, ''); }, hash.startsWith('#') ? hash : '#' + hash).catch(() => {});
  await page.waitForTimeout(1200);
  if (prep) await prep(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('saved', name);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await setup(page);
await shot(page, 'people', '');
await shot(page, 'gifts', '#/gifts', async (pg) => { await pg.evaluate(() => window.scrollTo(0, 215)); await pg.waitForTimeout(500); });
await shot(page, 'person', '#/person/p5');
await shot(page, 'people2', '', async (pg) => { await pg.evaluate(() => window.scrollTo(0, 760)); await pg.waitForTimeout(400); });
await shot(page, 'settings', '', async (pg) => { await pg.getByRole('button', { name: 'Settings' }).click(); await pg.waitForTimeout(600); });
await shot(page, 'add', '#/add?url=https%3A%2F%2Fwww.target.com%2Fp%2Fcast-iron-skillet');
await browser.close();
