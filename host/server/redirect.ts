// Shared with the page (src/lib/host.ts), so an old link is followed the same way whether the server
// answers it or the page meets it. No imports: the page's build reads this file too.

/**
 * Where moved, renamed or removed Data Apps went, from the `redirects` of a repo's `apps/_meta.yaml`.
 * Paths are as a page's URL has them under `/apps/`, decoded and without `.html`: `sales/overview`.
 * A key ending in `/` is a folder, and moves everything under it to its value, a folder too:
 * `sales/: finance/` sends `sales/overview` to `finance/overview`. Any other key is one Data App.
 */
export type Redirects = Record<string, string>;

/** How many redirects a chain may take before it is taken for a loop. */
const maxSteps = 32;

/** Where one redirect sends a path: its own key first, else the longest folder it is under; none if no key matches. */
export function redirectStep(redirects: Redirects, path: string): string | undefined {
  // `Object.hasOwn`, as a path could be `constructor`.
  if (Object.hasOwn(redirects, path)) return redirects[path];
  let folder: string | undefined;
  for (const from of Object.keys(redirects)) {
    if (from.endsWith('/') && path.startsWith(from) && from.length > (folder?.length ?? 0)) folder = from;
  }
  return folder === undefined ? undefined : `${redirects[folder]}${path.slice(folder.length)}`;
}

/** A path followed through the redirects: where it ends, if that is somewhere, and each step on the way. */
export interface Followed {
  /** The first path on the way that `exists`; none if the chain stops short of one, or loops. */
  to?: string;
  /** The path asked for, then each path it was sent to. */
  chain: string[];
  /** The chain came back to a path it had passed, or grew too long. */
  loop: boolean;
}

/**
 * Follow a path through the redirects, one after another (`a` to `b`, `b` to `c`), until one
 * `exists`. The path itself is not checked: it is the one that isn't there.
 */
export function followRedirects(
  redirects: Redirects,
  path: string,
  exists: (path: string) => boolean,
): Followed {
  const chain = [path];
  let current = path;
  for (let step = 0; step < maxSteps; step++) {
    const next = redirectStep(redirects, current);
    if (next === undefined) return { chain, loop: false };
    const loop = chain.includes(next);
    chain.push(next);
    if (loop) return { chain, loop };
    if (exists(next)) return { to: next, chain, loop };
    current = next;
  }
  return { chain, loop: true };
}

/** Where an old path should go: a path that `exists`, or none, when nothing does. */
export const redirectOf = (redirects: Redirects, path: string, exists: (path: string) => boolean) =>
  followRedirects(redirects, path, exists).to;
