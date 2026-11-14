# Minimize groups

The People screen can get long with many groups. Each group can be minimized so you only scroll past the ones you care about.

## How it works
- Each group header has a chevron button on its left: tap it to minimize or open the group. "Collapse all" and "Expand all" sit above the groups (shown when there is more than one).
- A minimized group shows its icon, name, how many people it has and its total (for example "30 people · $267 · over budget", the last part in red when it is over its budget). The add-person, add-family and edit buttons stay. The budget bar, families and people cards are hidden.
- The button is a real button with `aria-expanded`, `aria-controls` and a label such as "Collapse Coworkers", so it works with the keyboard (Tab, then Enter or Space) and screen readers.
- New groups start open.

## Where the choice is kept
On this phone or browser only, in `localStorage` under `giftlist.collapsed-groups`: a list of group ids. It is a display preference, not list data, so it does not go against the rule that list data never goes in browser storage: no names, people, gifts or money are stored, and nothing is sent to Supabase. Your partner's screen is not affected. Ids of deleted groups are ignored. If storage is blocked (some private windows), everything simply starts open.

## Code
- `src/lib/collapsed.ts`: `useCollapsedGroups`, with the pure helpers `parseCollapsed` and `toggleCollapsed` (tests in `collapsed.test.ts`).
- `src/screens/PeopleView.tsx`: the chevron, the summary line and the hidden group body.
- `src/styles.css`: `.group-fold`, `.group.is-collapsed`, `.group-fold-all`.

## Pitfalls
- Keep the hidden body in the page (`hidden` attribute) so the chevron's `aria-controls` still points at something.
- Do not move the preference into Supabase unless you want it shared between devices; that would need a table and the RLS test extended.
