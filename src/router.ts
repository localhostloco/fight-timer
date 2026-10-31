// Hash routing: GitHub Pages has no SPA fallback, so every route lives after '#'.
import { signal } from '@preact/signals';

export type Route =
  | { name: 'home' }
  | { name: 'edit'; id?: string }
  | { name: 'share'; payload: string }
  | { name: 'run' }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('/');
  switch (path[0]) {
    case 'edit': return { name: 'edit', id: path[1] ? decodeURIComponent(path[1]) : undefined };
    case 's': return path[1] ? { name: 'share', payload: path[1] } : { name: 'home' };
    case 'run': return { name: 'run' };
    case 'settings': return { name: 'settings' };
    default: return { name: 'home' };
  }
}

export const route = signal<Route>(typeof location !== 'undefined' ? parseRoute(location.hash) : { name: 'home' });

export function navigate(to: string): void {
  location.hash = to.startsWith('#') ? to : `#/${to.replace(/^\//, '')}`;
}

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => { route.value = parseRoute(location.hash); });
}
