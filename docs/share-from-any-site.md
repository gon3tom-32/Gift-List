# "Share to our app from any site": how Gift-List does it, and how to reuse it

This guide explains the feature in Gift-List where you tap **Share** on any shop page, choose the app, and a new idea opens already filled in with the product's name, picture and price. It is written so the same idea can be rebuilt for another product, for example **sharing a vehicle listing from another site into an Autotrader / AI Mode experience**. Wherever Gift-List captures gift details, you would capture vehicle details instead.

---

## 1. The idea in one picture

```
 Any website            Phone share sheet          Your web app                 Your server
 (listing page)  ──►   "Share → MyApp"      ──►   #/add?url=<listing link> ──►  fetches the page,
                       (iPhone Shortcut)           opens a pre-filled form      reads the details,
                                                   with a "Looking up…" state   returns small JSON
                                                          ▲                              │
                                                          └──── title, photo, price ◄────┘
```

Three small pieces, each simple on its own:

1. **A way to hand a link to the app** (iPhone Shortcut, Android share target, or a pasted link).
2. **A deep link the app understands** (`#/add?url=…`) that opens a quick-add form with the link filled in.
3. **A server function that reads the listing page** and returns the interesting details (title, photo, price, and anything else you care about). The form fills itself in, and the person can fix anything before saving.

The rule that holds it all together: **reading the page is a convenience, never a requirement.** If the lookup is slow, blocked or wrong, the person can still type the details and save.

---

## 2. Piece one: getting the link into the app

### iPhone: a Shortcut in the Share Sheet (what Gift-List uses)

A web app saved to the Home Screen cannot register itself in the iPhone Share Sheet, so each person makes a tiny Shortcut once. The app's Settings screen shows these steps with a copy button for the address:

1. Open **Shortcuts**, tap **+**, name it after the app.
2. Tap the **ⓘ** details and turn on **Show in Share Sheet**. Set it to accept **URLs, Safari web pages and Text**.
3. Add the action **URL Encode** (input: *Shortcut Input*).
4. Add a **Text** action: paste the app address ending in `#/add?url=`, then add the variable **URL Encoded Text** right after it.
5. Add **Open URLs** (input: that Text).

Result: Share → *MyApp* opens `https://your-app.example/#/add?url=<encoded listing link>`.

**Known limit (important to tell users):** *Open URLs* opens Safari, not the Home Screen copy of the app. On iPhone the two have separate storage, so the person may need to sign in again the first time. The only ways around it are a native app with a Share Extension (needs an Apple Developer account and TestFlight) or copying the link and opening the app.

### Android

Android supports a real **Web Share Target**: add a `share_target` to the web app manifest and the app appears in the Share menu with no setup:

```json
"share_target": {
  "action": "/#/add",
  "method": "GET",
  "params": { "url": "url", "text": "text", "title": "title" }
}
```

(Gift-List does not use this yet because iPhone is the main device. If the Autotrader audience includes Android, add it. Test the hash-route interaction on a real device.)

### Always keep a manual path

A **paste a link** field in the same form means the feature works everywhere, including desktop.

---

## 3. Piece two: the deep link and the quick-add form

### The link contract

```
https://app.example/#/add?url=<link>          (preferred)
https://app.example/#/add?text=<anything>     (some apps share text only)
```

Gift-List uses a **hash route** (`#/…`) because it is hosted on GitHub Pages, so there is no server-side routing. With a real server you can use a normal path (`/add?url=`). Either way, parse it in one small, well-tested function.

### Shared content is messy. Parse defensively

Real shares look like: `Check out this car https://a.co/xyz`, or the link is encoded, or not, or contains its own `&`. Gift-List's `parseShare` handles it like this:

- If the query starts with `url=`, treat **everything after it** as the shared thing (even if it contains `&`).
- Otherwise read `url` and `text` parameters.
- Find the first `https?://…` in the combined text, trim trailing punctuation (`) . , ; ! ?`).
- Whatever text is left over (minus dangling `(` or `-`) becomes a **name hint**, capped at 200 characters.

```ts
const LINK = /https?:\/\/[^\s<>"']+/i;

export function parseShare(query: string): { url: string | null; text: string | null } {
  let raw: string;
  let text = '';
  if (/^url=/i.test(query)) {
    raw = safeDecode(query.slice(4));
  } else {
    const params = new URLSearchParams(query);
    raw = params.get('url') ?? '';
    text = params.get('text') ?? '';
  }
  const all = `${raw} ${text}`.trim();
  const match = LINK.exec(all);
  const url = match ? match[0].replace(/[).,;!?]+$/, '') : null;
  const rest = (match ? all.replace(match[0], ' ') : all)
    .replace(/\s+/g, ' ')
    .replace(/[\s([{:|–—-]+$/, '')
    .trim();
  return { url, text: rest ? rest.slice(0, 200) : null };
}
```

Write unit tests with real examples you have collected (encoded, unencoded, with text, with tracking parameters, with a trailing period).

### Open the form, then tidy the address

When the app sees the `add` route and the user's data has loaded:

1. Open the quick-add sheet with `link` and `name` pre-filled.
2. Immediately replace the address with `#/` (`history.replaceState`) so a reload does not open the form again.

### The form: fast, forgiving, never blocked

- **Only the minimum is required** (Gift-List: just a name. For vehicles: probably just the link, or year/make/model).
- When a link is present, wait ~400 ms (debounce), then call the lookup. Show "Looking up the link…" in the field hint, not as a blocking spinner.
- When the answer arrives, **fill only fields the person has not already touched** (a `touched` ref per field). Never overwrite typing.
- Show where a value came from ("Price from Cars.com. Change it if you like.").
- If the lookup returns nothing, say nothing. The form just stays as it was.
- Save the record first, then fetch and upload the photo in the background (see section 5).

---

## 4. Piece three: the server function that reads the page

Browsers cannot read other sites' pages (CORS), so a small server function does it. Gift-List uses a **Supabase Edge Function** (Deno), but any serverless runtime works.

### API shape

```
GET /link-preview?url=<listing link>     -> { title, image, site, price, ... }
GET /link-preview?image=<picture url>    -> the picture bytes (so the app can download it)
```

Both require a **signed-in user** (check the session token inside the function). Deploy with JWT verification off at the gateway if you need the browser's CORS preflight to succeed, and do the real auth check in code.

### Safety rules (non-negotiable, because it fetches arbitrary URLs for strangers)

This is an SSRF risk (server-side request forgery). Gift-List's rules:

- Only `http`/`https`, standard ports (80/443), no `user:password@` in the URL.
- Block `localhost`, `*.localhost`, `*.internal`.
- **Resolve the hostname and refuse private, loopback, link-local and cloud-metadata addresses** (`10/8`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`, `100.64/10`, IPv6 `::1`, `fc00::/7`, `fe80::/10`, and IPv4-mapped IPv6).
- **Follow redirects by hand** (max ~5) and run the same check on **every hop**. Short links (a.co, bit.ly) redirect several times.
- **Time limit** (5 s) and **size limit** (read at most ~600 KB of HTML, ~5 MB for an image; stop reading when reached).
- Only accept image responses with an image content type, and ignore tiny files (a 1x1 placeholder).
- Never put a service-role / admin key in the browser. It lives only in the function's environment.

### Fetch like a phone

Many sites block unknown bots. Send a normal **mobile browser User-Agent** and `accept-language`. Some sites (Amazon) still return a "robot check" page; handle that by falling back to what the URL itself tells you (title from the URL slug, a picture from a known pattern).

### Read the details: a layered strategy

Try the most reliable, most generic sources first; fall back to site-specific ones.

1. **Open Graph / Twitter meta tags** (`og:title`, `og:image`, `og:site_name`, `product:price:amount`, `og:price:amount`).
2. **JSON-LD structured data** in `<script type="application/ld+json">`. This is where listing sites usually put the good stuff. Parse it as JSON, walk the tree, and read the node whose `@type` is what you want. **Do not take "the first price anywhere on the page"**: Best Buy listed a protection plan before the product and we showed the wrong price. Scope to the product node's `offers`.
3. **Microdata** (`itemprop="price"`) and `<link rel="image_src">`.
4. **Site-specific parsers** for the sites that matter most (Gift-List has one for Amazon: phone-layout image attributes, the `a-offscreen` price block, ASIN). Keep each one small, with sample HTML in the tests.
5. **Embedded page state** (some sites ship `"currentPrice":9.99` in a JSON blob).
6. **Last resort:** an LLM extraction pass on the cleaned page text (see section 8).

Normalise as you go: strip entities, trim, cap lengths, convert `"$1,299.99"` to `1299.99`, accept only sane ranges, and **only USD** when the page states a currency.

### Return a small, boring shape

```ts
{ title: string|null, image: string|null, site: string|null, price: string|null }
```

Any failure (timeout, blocked, not HTML) returns empty fields. It does not throw to the user.

### Images: fetch through your server

Other sites often refuse direct downloads from your domain. The app calls `?image=<url>` on your function, receives the bytes as a `Blob`, resizes it on the client (max 1200 px, JPEG/WebP), and uploads it to **private storage**, storing only the **path** in the database and making a signed URL at display time.

---

## 5. Putting it together: the save flow

```
share → deep link → form opens (link + hint filled)
      → 400 ms later: lookup → title / price / photo suggestion fill untouched fields
      → person edits and taps Save
      → record is saved immediately (no waiting on the photo)
      → in the background: download the picture via your function, upload it, attach its path
      → go to the list view and highlight the new item
```

---

## 6. What to capture for vehicle listings (Autotrader version)

Gift-List captures: name, store, link, photo, estimate, status. For a vehicle listing, plan for something like:

| Field | Where it usually comes from |
|---|---|
| Year, make, model, trim | JSON-LD `Vehicle` / `Car` (`vehicleModelDate`, `brand`, `model`, `vehicleConfiguration`) or the page title |
| Price | JSON-LD `offers.price` + `priceCurrency` (scope to the vehicle's own offer) |
| Mileage | `mileageFromOdometer` (`value`, `unitCode`: SMI = miles, KMT = km) |
| VIN | `vehicleIdentificationNumber` (validate: 17 characters, no I/O/Q, check digit) |
| Condition (new / used / CPO) | `itemCondition`, or the page text |
| Photos | `image` (array) and `og:image` |
| Seller / dealer, location | `seller` / `offeredBy`, page text |
| Listing URL and source site | the shared link; derive the site name from the host |
| Time captured | store it: listings change and disappear |

Design notes specific to vehicles:

- **Key the record on VIN when you have it** so the same car shared twice (or from two sites) is recognised as one vehicle.
- **Store the raw extracted values and a "source" per field** (JSON-LD, meta tag, LLM, user-typed) so you can show confidence and debug wrong readings.
- **Price and availability change.** Save a timestamp and consider a "refresh" action that re-reads the link.
- Mark user-edited fields so a refresh never overwrites what the person corrected.

---

## 7. Money and data rules worth copying

- Store money as exact decimals (or whole cents), never floats. Gift-List keeps `numeric(12,2)` in Postgres and whole cents in the app.
- Row-level security on every table; every policy checks membership. Add a test for each new table.
- Photos in a private bucket; save paths, create short-lived signed URLs when displaying.
- Keep list data out of `localStorage`; use it only for tiny per-device conveniences.

---

## 8. Using it with an AI Mode experience

The extraction pipeline gives AI Mode something much better than a raw link: **a structured vehicle record**. Suggested integration points (adapt to your architecture):

1. **Share creates (or opens) a conversation context.** Instead of a quick-add form, the deep link can open AI Mode with the listing already attached: `…/ai?listing=<link>`. The server function returns the structured record; AI Mode receives it as grounded context ("Here is the car the shopper is looking at").
2. **Let the model fill gaps, but keep the structured path first.** Deterministic parsing (JSON-LD, meta tags) is fast, cheap and predictable. Use an LLM only when those return little. Give it the cleaned page text (strip scripts, nav, footers; cap the length) and ask for **strict JSON matching your schema**, then validate the JSON in code before trusting it.
3. **Never let the page instruct the model.** Fetched pages are untrusted. Treat their text as data, wrap it clearly, and ignore any instructions inside it.
4. **Show the shopper what was read.** A small "Here is what I understood" card (year, make, model, price, mileage, photo, source) with an easy edit builds trust and catches mistakes.
5. **Useful AI Mode follow-ups once a listing is captured:** compare with similar Autotrader listings, flag a price far from market, summarise history and features, suggest questions to ask the dealer, estimate monthly payment.
6. **Cache and rate-limit.** Cache successful reads by normalised URL for a short time; rate-limit lookups per user to protect the function and the source sites.

---

## 9. Legal, policy and etiquette (check these before building)

- **Terms of service and robots rules of the sites being read.** Fetching a page a person is actively viewing, for that person, is the gentlest case, but check each source's terms. For sites you partner with, prefer an official feed or API over scraping.
- **Don't republish** other sites' photos or text publicly. Keep them private to the person who shared them unless you have rights.
- **Privacy:** treat shared links as personal data (they can contain tracking IDs, emails or tokens). Strip tracking parameters before storing where you can.
- **Identify yourself responsibly** and keep volume low. Back off on errors.

---

## 10. Testing approach that worked

- **Pure functions get unit tests with real samples:** the share-link parser, the price finder, the structured-data walker, the VIN validator, the SSRF address checks. Keep small saved HTML fixtures for each important site.
- **A fake-DOM harness** for scripts that cannot run in the sandbox (we ran the Scriptable widget against stand-ins for its drawing objects, and rendered it in a headless browser).
- **A real-device check** for the Shortcut and the share flow. Emulators do not show Share Sheet behaviour.
- When a site is wrong, **add its sample page as a test first**, then fix the parser. (Best Buy's price and Amazon's photo were both fixed this way.)

---

## 11. Pitfalls we hit (so you can skip them)

| What happened | Lesson |
|---|---|
| Amazon returned no image or a "robot check" | Use a mobile User-Agent; read the phone page layout (`data-a-hires`, `main-image`); fall back to the URL's own info. |
| Wrong price from Best Buy | Never take the first `"price"` on a page. Read the product node's offer, and prefer the current-price field in embedded state. |
| Shared text contained the link plus words | Parse the link out and keep the leftover words as a name hint. |
| Reload re-opened the quick-add form | Replace the address with `#/` right after opening the form. |
| The Shortcut opens Safari, not the installed app | Document it. Different storage means a possible re-login. Native app or Share Extension is the real fix. |
| The Home Screen icon looked old after an update | iPhone caches icons by filename. Rename the icon files when you change them. |
| Pasted secrets had stray spaces and line breaks | Trim them in code and report *which* secret is missing, never its value. |
| Two projects with the same name in different cloud organisations | Check the project reference in the address, not the name. |

---

## 12. A build checklist for the Autotrader version

1. **Decide the schema:** which vehicle fields, which are required (aim for none), which are user-editable.
2. **Write the share-link parser** and its tests (copy `parseShare`).
3. **Create the deep-link route** and a quick-add form that opens pre-filled and never blocks saving.
4. **Build the server function:** SSRF guard, redirect-by-hand, size and time limits, signed-in check. Return the small JSON shape.
5. **Add parsers in layers:** meta tags, JSON-LD Vehicle/Car, then the two or three most-shared listing sites, each with fixtures.
6. **Photos:** download through the function, resize on the client, store privately, save paths only.
7. **Ship the iPhone Shortcut instructions** in the app's Settings with a copy button; add the Android `share_target` if relevant.
8. **Wire the record into AI Mode** as grounded context, with the "here is what I understood" card.
9. **Add safeguards:** rate limits, caching, tracking-parameter stripping, logging that never records secrets.
10. **Test on real phones** (iPhone Shortcut, Android share) with a handful of real listings from each source site.

---

### Where the Gift-List code lives (for reference)

| Part | File |
|---|---|
| Parse the shared link and the `#/add` route | `src/lib/route.ts` (+ `route.test.ts`) |
| Ask the server about a link; download the picture | `src/lib/linkPreview.ts` |
| Quick-add form that fills itself in | `src/sheets/QuickAddSheet.tsx` |
| Open the form from the deep link | `src/screens/Home.tsx` (the `shared` effect) |
| Shortcut instructions shown to the user | `src/sheets/SettingsSheet.tsx` (`ShareShortcutHelp`) |
| The server function (fetch, safety, parsing) | `supabase/functions/link-preview/index.ts`, `preview.ts` (+ `preview.test.ts`) |
