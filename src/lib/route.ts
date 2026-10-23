import { useEffect, useState } from 'react';

// Tiny hash router so the phone's back button works.
export type Route =
  | { name: 'people' }
  | { name: 'gifts' }
  | { name: 'person'; id: string }
  // Shared from another app (via the iPhone Shortcut): open quick-add pre-filled.
  | { name: 'add'; url: string | null; text: string | null };

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

const LINK = /https?:\/\/[^\s<>"']+/i;

/**
 * Reads '#/add?url=…' (or '?text=…'). Shared content is messy: the link may
 * be encoded or not, or buried in text like "Check out X https://a.co/abc".
 */
export function parseShare(query: string): { url: string | null; text: string | null } {
  let raw: string;
  let text = '';
  if (/^url=/i.test(query)) {
    // Everything after url= is the shared thing, even if it has its own '&'.
    raw = safeDecode(query.slice(4));
  } else {
    const params = new URLSearchParams(query);
    raw = params.get('url') ?? '';
    text = params.get('text') ?? '';
  }
  const all = `${raw} ${text}`.trim();
  const match = LINK.exec(all);
  const url = match ? match[0].replace(/[).,;!?]+$/, '') : null;
  const rest = (match ? all.replace(match[0], ' ') : all)
    .replace(/\s+/g, ' ')
    .replace(/[\s([{:|–—-]+$/, '') // drop a dangling "(" or "-" left where the link was
    .trim();
  return { url, text: rest ? rest.slice(0, 200) : null };
}

export function parseRoute(hash: string): Route {
  const body = hash.replace(/^#\/?/, '');
  if (/^add(\?|$)/.test(body)) {
    const query = body.slice(body.indexOf('?') + 1 || body.length);
    return { name: 'add', ...parseShare(query) };
  }
  const parts = body.split('/');
  if (parts[0] === 'gifts') return { name: 'gifts' };
  if (parts[0] === 'person' && parts[1]) return { name: 'person', id: parts[1] };
  return { name: 'people' };
}

export function routeHref(r: Route): string {
  if (r.name === 'gifts') return '#/gifts';
  if (r.name === 'person') return `#/person/${r.id}`;
  if (r.name === 'add') return r.url ? `#/add?url=${encodeURIComponent(r.url)}` : '#/add';
  return '#/';
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
