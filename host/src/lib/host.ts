// What the page knows of the Data Apps it shows, apart from the core API. anfra serves the page
// (embedded in its binary), the app files under `/appserve/files/`, and the core API under `/api`.

import type { AppPrompt, Catalog, Entry } from './entry';
import { rootApp } from './root';

export type { AppPrompt, Catalog, Entry };

export type AppEntry = Extract<Entry, { kind: 'app' }>;
export type FolderEntry = Extract<Entry, { kind: 'folder' }>;

/** The Data Apps: only the root app, as the host has no app browser. */
export async function catalog(): Promise<Catalog> {
  return { entries: [{ kind: 'app', path: rootApp, label: 'Library', tags: [], endorsed: false }] };
}

/** What changed in the repo, in development: Data Apps (their paths), or the AML. */
export type RepoEvent = { type: 'apps'; paths: string[] } | { type: 'aml' };

/** Follow the repo's changes. None are sent: reload by hand. Returns a stop function. */
export function onRepoEvent(_listener: (event: RepoEvent) => void): () => void {
  return () => {};
}

/** A Data App's page: `/apps/<path without .html>`. */
export function urlOf(path: string): string {
  return `/apps/${path
    .replace(/\.html$/i, '')
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

/** The Data App a page shows: `/` shows the root app (src/lib/root.ts). */
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
