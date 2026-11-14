// Which groups are minimized on the People screen. This is a display preference
// for this phone or browser, not list data: only group ids are kept, nothing
// about people, gifts or money, and nothing goes to Supabase.

import { useCallback, useMemo, useState } from 'react';

const KEY = 'giftlist.collapsed-groups';

/** Reads a stored list of group ids, ignoring anything that isn't one. */
export function parseCollapsed(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function toggleCollapsed(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function read(): string[] {
  try {
    return parseCollapsed(window.localStorage.getItem(KEY));
  } catch {
    return []; // private windows or blocked storage: everything just starts open
  }
}

function write(list: string[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* not remembered, still works */
  }
}

/** Collapsed state for the groups on screen. Ids of groups that no longer exist are ignored. */
export function useCollapsedGroups(groupIds: string[]) {
  const [stored, setStored] = useState<string[]>(read);
  const known = useMemo(() => new Set(groupIds), [groupIds]);
  const collapsed = useMemo(() => stored.filter((id) => known.has(id)), [stored, known]);

  const update = useCallback((next: string[]) => {
    setStored(next);
    write(next);
  }, []);

  return {
    isCollapsed: (id: string) => collapsed.includes(id),
    toggle: (id: string) => update(toggleCollapsed(collapsed, id)),
    collapseAll: () => update([...groupIds]),
    expandAll: () => update([]),
    count: collapsed.length,
  };
}
