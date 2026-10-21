// What the page asks this host's own server (server/app.ts), apart from the core API.

import type { AppPrompt, Catalog, Entry } from '../../server/entry';
import { type Redirects, redirectOf } from '../../server/redirect';
import { rootApp } from '../../server/root';

export type { AppPrompt, Catalog, Entry, Redirects };

export type AppEntry = Extract<Entry, { kind: 'app' }>;
export type FolderEntry = Extract<Entry, { kind: 'folder' }>;

export async function catalog(): Promise<Catalog> {
  const response = await fetch('/host/apps');
  if (!response.ok) throw new Error(`The server answered ${response.status}.`);
  return response.json();
}

/**
 * Where an old link to a Data App goes, as the repo's redirects say (`apps/_meta.yaml`): a Data App
 * there, or none. Paths as the tree has them, with their `.html`. The server sends such a link on
 * before the page loads; this is for those it doesn't see: in development, where Vite serves the
 * page, and back or forward to a page since moved.
 */
export function movedTo(entries: Entry[], redirects: Redirects, path: string): string | undefined {
  const to = redirectOf(redirects, path.replace(/\.html$/i, ''), (p) => !!findApp(entries, `${p}.html`));
  return to && `${to}.html`;
}

/** What changed in the repo, in development: Data Apps (their paths), or the AML. */
export type RepoEvent = { type: 'apps'; paths: string[] } | { type: 'aml' };

/** Follow the repo's changes; only the development server sends them. Returns a stop function. */
export function onRepoEvent(listener: (event: RepoEvent) => void): () => void {
  const source = new EventSource('/host/events');
  source.addEventListener('message', (event) => listener(JSON.parse(event.data)));
  return () => source.close();
}

/** A Data App's page: `/apps/<path without .html>`. */
export function urlOf(path: string): string {
  return `/apps/${path
    .replace(/\.html$/i, '')
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

/** The Data App a page shows: `/` shows the root app (server/root.ts). */
export function pathOf(pathname: string): string | undefined {
  if (pathname === '/') return rootApp;
  if (!pathname.startsWith('/apps/')) return undefined;
  const rest = pathname.slice('/apps/'.length).replace(/\/+$/, '');
  return rest ? `${rest.split('/').map(decodeURIComponent).join('/')}.html` : undefined;
}

export function findApp(entries: Entry[], path: string): AppEntry | undefined {
  for (const entry of entries) {
    if (entry.kind === 'app' && entry.path === path) return entry;
    if (entry.kind === 'folder') {
      const found = findApp(entry.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

/** The versions serving, from `/health`: this host's, and anfra's, or null while anfra does not answer. */
export type Health = { host: string; anfra: string | null };

export async function health(): Promise<Health> {
  // 503 still carries the body: anfra is down, the host is not.
  const response = await fetch('/health');
  return response.json();
}
