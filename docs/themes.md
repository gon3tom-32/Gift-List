# Themes (Classic and Hawaiian Christmas)

**What:** Settings, "Look", switches the whole app between Classic Christmas and Hawaiian Christmas (deep teal, hibiscus, pineapple, watermelon and strawberry ornaments, hula gingerbread men, fronds). Candy-cane stripes stay in both.

**How:** the choice is saved on the device (`localStorage` key `gift-list-theme`, only the theme name, never list data). `applyTheme` sets `data-theme="hawaii"` on `<html>` (none for Classic) and updates `theme-color`. A tiny script in `index.html` does the same before first paint so there is no flash.

**Code:** `src/lib/theme.ts` (+ test), `src/themes/hawaii.css`, artwork in `src/themes/hawaii/` (`pattern.svg` tile, `scene.svg` end-of-list panel), the Look page in `src/sheets/SettingsSheet.tsx`.

**Rules:**
- Every rule in a theme file is scoped to `:root[data-theme='x']` so Classic is never affected.
- A theme sets the colour tokens (light and dark) and a few decorations; it should not restructure components.
- Keep text contrast AA. Hawaiian green is darker (`#0f7a66`) so white button text passes.
- To add a theme: add it to `THEMES`/`THEME_LABELS`/`COLORS` in `theme.ts`, add a CSS file, a `.theme-<name> .theme-swatch` preview style, and update the early script in `index.html`.

**Artwork:** drawn for this app. To use other art, replace the two SVG files (check the licence first).

**Pitfalls:** blocked storage (private windows) falls back to Classic without errors; the choice is per device, not shared with the partner.
