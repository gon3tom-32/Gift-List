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
`public/landing/screen-*.webp` are real screenshots of the real app, filled with a made-up family ("Maple family"): no real names, emails or photos. Pictures on the gift cards are generated illustrations.

`docs/landing/make-screens.mjs` makes them. It runs the built app in headless Chromium and answers every Supabase request with the invented household, so nothing real is read or written.

```
VITE_SUPABASE_URL=https://demo.supabase.co VITE_SUPABASE_ANON_KEY=demo-anon npx vite build --outDir /tmp/demo-dist
npx vite preview --outDir /tmp/demo-dist --port 4173
PW_PATH=<path to playwright/index.js> OUT=/tmp/shots node docs/landing/make-screens.mjs
```
Then convert the PNGs to WebP (quality about 82, 780 px wide) into `public/landing/`.

## Pitfalls
- The screenshots show the Christmas countdown as of the day they were taken ("59 days"). Re-shoot when the app's look changes, or when the number looks odd.
- Keep the total image weight small (now about 330 KB). Use WebP.
- Never use a real household for screenshots.
- If a new screen should be on the page, add a `FEATURES` entry in `Landing.tsx` and an image with useful `alt` text.
