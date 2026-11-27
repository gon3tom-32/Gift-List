# Receipts

**What:** keep receipt photos, and make the totals right. A gift's **Paid** (tax included) is what counts toward the budget once the gift is past "idea" (see the money rules in `CLAUDE.md`); the receipt is the proof.

- **Gift page, "Receipts":** add a receipt photo, attach a receipt that already exists (one receipt can cover several gifts), optionally type the receipt's total, remove it from this gift. With a total, it shows how much of it the attached gifts' Paid amounts account for, how much is not on a gift yet, and how many gifts have no Paid.
- **Quick add, "I bought it":** enter Paid (tax included) and add a receipt; the gift is saved as Ordered with that Paid and the receipt attached. Only the name is required.

**How it works:** tables `receipts` (photo path, optional total, store) and `gift_receipts` (gift to receipt links), migration `0010_receipts.sql`. Photos live in the private `gift-photos` bucket under `<household_id>/receipts/` (resized to 1600 px wide) and are shown with signed URLs. A receipt that no longer covers any gift is deleted by a database trigger; the app then deletes the file (`detachReceipt`, `deleteGift` in `src/lib/data.ts`). Receipts live-update to the partner like everything else.

**Code:** `src/components/Receipts.tsx`, `src/lib/receipts.ts` (+ test, math in whole cents), `src/sheets/QuickAddSheet.tsx`, `src/sheets/GiftSheet.tsx`, `src/lib/data.ts`.

**Rules and pitfalls:**
- Receipt total is only a check; it never changes the budget. Each gift keeps its own Paid.
- RLS on both tables with `is_household_member`; extended in `supabase/tests/rls_test.sql`. Cap: 300 receipts per list.
- A gift saves even if the receipt upload fails (a message says so).
- The CSV export has a "Receipts" column (count per gift), not the photos.
- Receipts can show card digits and addresses, so they are never made public.
