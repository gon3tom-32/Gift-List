# Gift-List

A playful, shared Christmas gift list and budget app for a couple. Both partners sign in and see and edit the same household list. The list covers any gift recipients (family, kids, pets, coworkers, etc.), not just family.

## Stack

- Frontend: Vite + React + TypeScript
- Backend: Supabase (Postgres, Auth via email magic link, Storage, Realtime)
- Hosting: GitHub Pages at https://gon3tom-32.github.io/Gift-List/, deployed by `.github/workflows/deploy.yml` on every push to `main`
- Server code: Supabase Edge Functions (`supabase/functions/`), e.g. link previews
- Schema lives in `supabase/schema.sql`. Change the database only through new migration files (`supabase/migrations/`) or SQL reviewed in plan mode, then update `schema.sql` to match.

## Core concepts

- **Household**: the shared list. Two members (owner and editor) at launch. Both can edit everything, including budgets.
- **Group**: a category of recipients, such as "Our family", "Wife's family", "Coworkers", or "Pets". Each has an icon and an optional budget.
- **Person**: a recipient inside a group, with an optional budget and optional photo.
- **Gift**: an item for a person. Fields: name, store, link, photo, estimate, paid amount, status, assigned buyer (or shared), ship-by date, payment method.
- **Status flow**: `idea` → `ordered` → `shipped` → `wrapped` → `given`. Every change is recorded in `gift_events` with who made it.

## Money rules

- Store all money as `numeric(12,2)`. Never use floats for totals (the app uses whole cents, see `src/lib/money.ts`).
- A gift's **spent** amount is `paid` if entered, otherwise `estimate`, and only when the status is past `idea`.
- A gift's **planned** amount is `estimate` while the status is `idea`.
- Household "left to spend" = household budget − spent − planned. Show it red when negative.
- Totals are calculated in the app or a Postgres view. Do not store them.

## Security rules (non-negotiable)

- Row Level Security is ON for every table. Every policy uses `is_household_member(household_id)`.
- Only the Supabase anon key goes in the frontend. Never add the service role key to the client or to git.
- `.env.local` is in `.gitignore`. The public Supabase URL and publishable key for production live in the deploy workflow.
- Photos are in a private Storage bucket, `gift-photos`. Store paths in the database and create signed URLs at display time. The first folder in each path is the household ID.
- Never use `localStorage` or `sessionStorage` for list data. All data lives in Supabase.
- Keep `supabase/tests/rls_test.sql` passing (`npm run test:db`), and extend it for any new table.

## Photos and links

- Photos are optional but encouraged. Ideas save without them and show a friendly "add a picture" prompt.
- Resize images on the client before upload (max 1200px wide, JPEG/WebP).
- When a link is pasted, try to fetch the page title and image (`supabase/functions/link-preview`). If that fails, let the user type the name. Never block saving on link metadata.

## Design

- Playful and festive: snowy background, candy-cane and mint accents, rounded display font (Fredoka) for headers, clean sans-serif for details.
- Gifts display as cards with a photo, status badge, price, and a status progress strip.
- People show as cards with initials in a colored circle, or a photo if available.
- Group icons: gift box, paw, briefcase, tree, heart, star.
- Header shows the countdown to Christmas and how many gifts are still open.
- Small delights only: confetti when a gift is marked given, a soft wiggle when an idea is added. Respect `prefers-reduced-motion`.
- Mobile first. Quick-add needs only a name.
- Accessibility: visible focus states, labels on all inputs, contrast that works in light and dark mode.

## Working style

- Use plan mode before any database change, auth change, or change touching more than three files.
- Write tests for money calculations and status transitions (`npm test`).
- Commit in small, clearly described steps.
- Ask before adding dependencies beyond React, Supabase JS, and date-fns (Vitest is the approved dev test runner).

## Out of scope for now

- Gift-exchange games, reminders by text, store integrations, and multi-household sharing.
- Text-message reminders are out. Web push notifications (partner activity, budget, countdown) are in scope; keys and the send secret live only in Supabase function secrets.
