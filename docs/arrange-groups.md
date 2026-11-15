# Arrange the order of the groups

## What it does
On the People screen, **Reorder** (next to Collapse all / Expand all) opens "Arrange groups": a compact list with each group's icon, name and people count, and up and down arrows on every row. Each tap moves the group one place and saves at once. **Done** goes back to the normal view.

The order is shared: it is the same on every device and on your partner's screen (the live updates carry it).

## How it works
- The order is `gift_groups.sort_order`, which the People screen already sorts by (then by when the group was made). No database change.
- `moveItem` and `sortOrdersFor` in `src/lib/groupOrder.ts` (tests in `groupOrder.test.ts`): a move gives the groups the numbers 10, 20, 30... in the new order and returns only the groups whose number changed, so a move writes one or two rows.
- `reorderGroups` in `src/lib/data.ts` updates the list on screen first, writes the changed numbers, and if a save fails puts back only the numbers it changed (so nothing else that arrived meanwhile is lost) and the screen shows "Could not save the new order".
- New groups still get a large number (`Date.now()`), so they land at the end.
- The arrows are real buttons with labels such as "Move Pets up" (keyboard and screen readers); the first row's up arrow and the last row's down arrow are disabled.

## Not affected
The phone widget orders groups by who still needs gifts, All gifts is by gift, and the "Add a group" suggestions are unchanged.

## Not built (could be added)
Drag and drop. It needs a library or careful touch-event code on phones, so arrows were chosen first.
