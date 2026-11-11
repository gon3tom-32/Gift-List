# Groups of people with a headcount (Teachers x12)

For coworkers, a gift often goes to a whole group, like "Teachers" or "Aides", and everyone gets the same thing. Instead of adding each person, add one group with a number.

## How it works
- In a work group (a group with the briefcase icon, like Coworkers), **Add a person** has a switch "This is a group of people who all get the same gift" and a "How many people?" box (2 to 500). The person's card then shows "12 people".
- `people.headcount` (migration `0009_headcount.sql`) is 1 for everyone else.
- **Prices are per person.** Type $12 on a gift for "Teachers (12)" and the totals count $144. The gift card shows "$12.00 each x 12 people" and the total. If the count changes later, every total follows.
- Spent and planned follow the usual rules (paid if entered, else estimate; spent past idea, planned while an idea), then multiply by the headcount.
- Money stays whole cents: `giftSpent` and `giftPlanned` in `src/lib/money.ts` take a `count`; `sumGifts` and `personTotals` take `countOf`.
- The group total, the household budget bar and the "Buying for N people" line count the headcount.

## Rules and limits
- A gift for a group can't be shared with other people ("Also for someone else" is hidden for it, and groups are not offered as extra recipients). `giftCount` in `src/lib/recipients.ts` also makes any shared gift count as 1, so odd data can never double count.
- Headcount is between 1 and 500 (database check).
- The people cap per list (300) counts rows, not heads.

## The server matches the app
`supabase/functions/send-push/` adds up money too (over-budget alerts and the phone widget). `rules.ts` `withCounts` adds each gift's headcount from the people list, so the numbers match the app. Redeploy `send-push` when this changes.

## Pitfalls
- Entering the total instead of the per-person price: the field says "Estimate (each)" and shows "$12.00 each x 12 people = $144.00" as you type.
- The CSV export has People and Total columns for groups; its price columns are per person.
