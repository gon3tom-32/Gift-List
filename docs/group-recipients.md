# Groups of people (Teachers, Aides) who share one gift

For coworkers, a gift often goes to a whole group, like "Teachers" or "Aides", and everyone gets the same thing. Instead of adding each person, add one group with a number of people.

## How it works
- In a work group (a group with the briefcase icon, like Coworkers), **Add a person** has a switch "This is a group of people who all get the same gift" and a "How many people?" box (2 to 500). The card then shows "12 people".
- `people.headcount` (migration `0009_headcount.sql`) is 1 for everyone else.
- **It is one gift with one price: the full amount spent.** The price is never multiplied by the number of people. $81 for the Aides' gift is $81 in the totals.
- The headcount only shows how it splits: the gift card says "Split across 7 people · about $11.58 each" (`eachText` in `src/lib/money.ts`, the same wording as shared gifts), and the price boxes show the same hint as you type.
- Spent and planned follow the usual rules (paid if entered, else estimate; spent past idea, planned while an idea). Nothing about money depends on the headcount, so the app, the over-budget alerts and the phone widget always agree.
- "Buying for N people" in the header counts heads (it is a head count, not money).

## One gift across several groups
"Also for someone else" works for groups too: tick Teachers, Aides and Office staff on one gift, for example a treat tin.
- The price is still the full spend, counted once in the household total.
- Each recipient's share is **in proportion to its people**, so every person gets the same share. $200 across Teachers (13), Aides (7) and Office staff (9) is $89.65, $48.28 and $62.07 (about $6.90 a person). A single person counts as 1, so sharing between individuals splits equally as before.
- `splitWeighted` in `src/lib/money.ts` does the split (largest remainder, so the shares always add up to the exact cents); `personTotals` takes a `weightOf` (headcount) for the cards' totals.
- All gifts reads "Shared across 29 people · about $6.90 each"; on a group's page it reads "Shared with Aides, Office staff · Teachers' share $89.65".

## Rules and limits
- Headcount is between 1 and 500 (database check).
- The people cap per list (300) counts rows, not heads.

## History (pitfall we hit)
The first version multiplied the price by the headcount ("price is per person"). It made a $81 gift for 7 aides show $567. The rule was changed: the one price is the full spend. Do not reintroduce a multiplier without asking.

## CSV export
Has a **People** column with the group's headcount; Estimate and Paid are the full amounts.
