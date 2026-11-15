// Look of the app. Kept per device (like collapsed groups), never list data.
export const THEMES = ['classic', 'hawaii'] as const;
export type Theme = (typeof THEMES)[number];

export const THEME_LABELS: Record<Theme, string> = {
  classic: 'Classic Christmas',
  hawaii: 'Hawaiian Christmas',
};

const KEY = 'gift-list-theme';
const COLORS: Record<Theme, string> = { classic: '#18806a', hawaii: '#0f4442' };

export function parseTheme(value: unknown): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : 'classic';
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readTheme(store?: Store): Theme {
  try {
    return parseTheme((store ?? localStorage).getItem(KEY));
  } catch {
    return 'classic';
  }
}

export function saveTheme(theme: Theme, store?: Store): void {
  try {
    const s = store ?? localStorage;
    if (theme === 'classic') s.removeItem(KEY);
    else s.setItem(KEY, theme);
  } catch {
    // Blocked storage: the look still switches for this visit.
  }
}

/** Sets data-theme on <html> (none for Classic) and the browser colour bar. */
export function applyTheme(
  theme: Theme,
  root: Pick<HTMLElement, 'setAttribute' | 'removeAttribute'> = document.documentElement,
  meta: Pick<Element, 'setAttribute'> | null = document.querySelector('meta[name="theme-color"]'),
): void {
  if (theme === 'classic') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  meta?.setAttribute('content', COLORS[theme]);
}
