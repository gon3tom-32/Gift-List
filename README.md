# Gift-List

A playful, shared Christmas gift list and budget for a couple. Both partners sign in and edit the same list: groups (family, pets, coworkers…), people, and gifts that move from **idea → ordered → shipped → wrapped → given**.

Built with Vite + React + TypeScript and Supabase (Postgres, Auth, Storage, Realtime, Edge Functions). Hosted on GitHub Pages at <https://gon3tom-32.github.io/Gift-List/>.

## Set up Supabase (once)

1. Open your Gift-List project in Supabase → **SQL Editor**.
2. Paste and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). It creates the tables, Row Level Security, the private `gift-photos` bucket, and Realtime. It's safe to run again.
3. Optional check: paste and run [`supabase/tests/rls_test.sql`](supabase/tests/rls_test.sql). It should end with `ALL RLS TESTS PASSED`. It rolls itself back, so it leaves no test data.
4. **Authentication → URL Configuration**: set **Site URL** to `https://gon3tom-32.github.io/Gift-List/` and add it, plus `http://localhost:5173/Gift-List/`, to **Redirect URLs**. Magic links only return to addresses on this list.
5. Deploy the link-preview function in `supabase/functions/link-preview/` (`supabase functions deploy link-preview --no-verify-jwt`). It checks sign-in itself.
6. **Project Settings → API**: the **Project URL** and **publishable** key go in `.github/workflows/deploy.yml` and `.env.local`. Never use the service role key in this app.

## Run it locally

```sh
cp .env.example .env.local   # then paste the URL and anon key
npm install
npm run dev
```

`.env.local` is git-ignored. The app opens at `http://localhost:5173/Gift-List/`. Link previews call the deployed Edge Function; if it can't be reached, you just type the gift name.

## Deploy (GitHub Pages)

Every push to `main` runs `.github/workflows/deploy.yml`. It runs the tests, builds the app, and publishes it to GitHub Pages.

One-time setup: in the repo on GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.

## Using it

- Sign in with your email, create the list, and enter your partner's email. When they sign in with that email, they join automatically. (The app doesn't send them an email itself, so tell them the link.)
- Tap **+** to add an idea. Only the name is needed. Paste a shop link and the app tries to fill in the name and picture.
- Tap a card to fill in details: price, who's buying, ship-by date, payment method, photo.

## Money rules

All amounts are `numeric(12,2)` in Postgres and whole cents in the app ([`src/lib/money.ts`](src/lib/money.ts)).

- **Spent** = `paid` if entered, else `estimate`, once a gift is past `idea`.
- **Planned** = `estimate` while a gift is an `idea`.
- **Left to spend** = household budget − spent − planned (shown red when negative).

## Tests

```sh
npm test         # money, status flow, countdown, link-preview safety
npm run test:db  # migration + RLS tests on a throwaway local Postgres (needs Postgres binaries, run as non-root)
```

## Security

- Row Level Security is on for every table; every policy uses `is_household_member(household_id)`.
- The deploy workflow holds only the public Supabase URL and publishable key. The service role key is never used.
- Photos live in the private `gift-photos` bucket under `<household_id>/…` and are shown with short-lived signed URLs.
- List data lives only in Supabase. The browser stores just the Supabase sign-in session.
- Database changes go in new files under `supabase/migrations/`; `supabase/schema.sql` mirrors the full current schema.
