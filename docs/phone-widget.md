# Phone widget (Scriptable)

A Home Screen and Lock Screen widget for iPhone, made with the free Scriptable app. It needs no App Store build.

## What it shows
- **Medium (Home Screen):** on the left, the Gift List logo, days to Christmas, gifts still open and money left; on the right, up to **six groups** (Our family, Kids, Pets, Coworkers, Friends). Each group is a coloured circle with its initial and the name under it. A badge on the circle is either a red number (how many people in that group still don't have a gift bought) or a green check (everyone has one). The candy-cane stripe runs along the bottom. Money left turns pink when you are over budget.
- **Groups are ordered** most people still waiting first, then A to Z. Empty groups are left out. A group of people such as Teachers (13) counts as one entry. An idea or nothing yet counts as "still waiting"; ordered, shipped, wrapped or given counts as bought. A gift shared with several people counts for each of them.
- **Small and Lock Screen:** countdown and gifts open (and money left on the small one).
- Tapping the widget opens the app.
- The widget never contains gift names, only totals, group names and first names.

## Showing people instead of groups
The script starts with `const SHOW = "groups";`. Change it to `"people"` for the older grid of the six people who most need a gift (tap a person to open their page). If the server sends no groups (an older deploy), the script falls back to people by itself.

## How it works
1. In Settings, Phone widget, **Make my widget link** asks the `send-push` function for a private link: the person's id plus a signature only the server can make (`widgetToken.ts`, signed with the push secret). **Copy script** gives the Scriptable script with that link and the site address filled in (`buildWidgetScript` in `src/lib/widget.ts`).
2. The widget calls the link; `send-push` answers with totals, `people` and `groups` (`widgetSummary`, `widgetPeople`, `widgetGroups` in `supabase/functions/send-push/rules.ts`). It refreshes about every 30 minutes.
3. The whole medium layout is drawn as one picture, so nothing can shift or clip in Scriptable's stacks.

## Updating the widget
The server side updates when `send-push` is redeployed. The **script on the phone only changes when you paste a new one**: Settings, Phone widget, Copy script, then paste over the old script in Scriptable. The link stays the same. A widget with the old script keeps working (it reads `people`).

## Pitfalls
- Tests run the script with stand-in Scriptable objects (`src/lib/widget.test.ts`); a real phone can still differ, so check a change on a phone.
- Colours: a circle the same colour as the widget background gets a white ring so it is still visible.
- Keep gift names out of the widget data: it is readable by anyone holding the link.
