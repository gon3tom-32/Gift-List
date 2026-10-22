import { useEffect, useState } from 'react';

// Tiny hash router so the phone's back button works.
export type Route = { name: 'people' } | { name: 'gifts' } | { name: 'person'; id: string };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'gifts') return { name: 'gifts' };
  if (parts[0] === 'person' && parts[1]) return { name: 'person', id: parts[1] };
  return { name: 'people' };
}

export function routeHref(r: Route): string {
  if (r.name === 'gifts') return '#/gifts';
  if (r.name === 'person') return `#/person/${r.id}`;
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
