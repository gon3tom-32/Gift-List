# Your data: export and account deletion

## Export (done)
Settings, "Your data and account", "Download my list (CSV)".

- Built in the browser from the list that is already loaded (`src/lib/exportCsv.ts`); nothing new is requested from the server and nothing is stored.
- One row per gift: Person, Group, Family, Gift, Store, Link, Status, Estimate, Paid, Buyer, Shared with, Ship by, Payment method, Added by, Added on. People with no gifts still get a row. Groups follow the list's own order.
- Money is exact: whole cents turned into text like `89.50` (never floats).
- UTF-8 with a byte-order mark so Excel reads accents correctly.
- Cells that start with `=`, `+`, `-` or `@` get a leading apostrophe so a gift named like a formula cannot run in a spreadsheet.
- Gifts whose creator no longer has an account show "Added by Someone".
- Pictures are not included.

Tests: `src/lib/exportCsv.test.ts`.

## Account deletion
Not built yet; this page will be extended when it is.
