# Landing page

What visitors see when they are not signed in: a hero, five feature rows with real screens, a "little things" grid, and the sign-in card.

## How it works
- `src/screens/Landing.tsx` is rendered by `App.tsx` for the `signed-out` phase. Signed-in people go straight to their list as before.
- The sign-in card is `SignIn` with `embedded` set: it renders a `div` (not a second `main`), starts on the "New here?" tab and leaves out the old "How it works" strip. Without `embedded` it behaves as before.
- If someone returns from an expired email link (`notice`), the page scrolls straight to the sign-in card.
- Styles are at the end of `src/styles.css` (`.landing-*`, `.phone`, `.candy-rule`). Light and dark mode use the palette tokens; the hero uses fixed colours so it reads in both.
- Screens ease in on scroll with CSS `animation-timeline: view()` where supported. Reduced motion turns all animation off.
- `index.html` has the description and Open Graph tags (share image: `public/landing/screen-people.webp`).

## The screens
`public/landing/screen-*.webp` are real screenshots of the real app, filled with a made-up family ("Maple family"): no real names, emails or photos. The pictures on the gift cards are free-to-use stock photos from Pexels (list below), so the cards look like a real list.

`docs/landing/make-screens.mjs` makes them. It runs the built app in headless Chromium and answers every Supabase request with the invented household, so nothing real is read or written.

```
VITE_SUPABASE_URL=https://demo.supabase.co VITE_SUPABASE_ANON_KEY=demo-anon npx vite build --outDir /tmp/demo-dist
npx vite preview --outDir /tmp/demo-dist --port 4173
PW_PATH=<path to playwright/index.js> OUT=/tmp/shots node docs/landing/make-screens.mjs
```
Then convert the PNGs to WebP (quality about 82, 780 px wide) into `public/landing/`.

## Gift photos
Pexels photos (free to use, no credit needed; the Pexels licence still bars selling them as is). The script serves them from a `photos/` folder next to it, one JPEG per key, saved from
`https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?auto=compress&cs=tinysrgb&w=500`:

| Key | Pexels ID | Key | Pexels ID |
|---|---|---|---|
| scarf | 3151954 | game (chess) | 8438872 |
| spa | 1926811 | lego (toy blocks) | 298825 |
| pan | 5639274 | bone | 13419673 |
| book | 9572701 | plant | 1931143 |
| slippers | 6633363 | phones | 7054538 |
| art | 29589096 | sauce | 5793770 |
| soap | 16244099 | | |

The family picture on the household header is a generated illustration. Pexels' search needs a free API key and its website blocks scripts, so photo IDs were found through web search, then checked by eye. Do not use photos of identifiable people for gifts.

## Pitfalls
- The screenshots show the Christmas countdown as of the day they were taken ("59 days"). Re-shoot when the app's look changes, or when the number looks odd.
- Keep the total image weight small (now about 330 KB). Use WebP.
- Never use a real household for screenshots.
- If a new screen should be on the page, add a `FEATURES` entry in `Landing.tsx` and an image with useful `alt` text.
