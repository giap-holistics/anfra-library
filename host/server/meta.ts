import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { iconNames } from './entry.js';
import type { Redirects } from './redirect.js';

/** Where a repo says how its Data Apps are shown, under the apps folder; `.yml` is read too. */
export const metaFile = '_meta.yaml';
const altMetaFile = '_meta.yml';

/** What the manifest says of one folder or Data App. Every field is optional. */
export interface Meta {
  /** A folder's name, or a Data App's label, in place of the directory's or the `<title>`. */
  name?: string;
  /** A folder's line on what it holds: under its header on the home page, on hover in the sidebar. */
  description?: string;
  /** A name the page knows (src/lib/icons.ts). */
  icon?: string;
  tags: string[];
  /** A Data App vouched for: it shows a check on its icon. */
  endorsed?: boolean;
  /** A folder starts closed. */
  collapsed?: boolean;
  /** Sorts before the unordered, lowest first. */
  order?: number;
}

export interface MetaFile {
  /** By path relative to the apps folder, as `sales`. */
  folders: Map<string, Meta>;
  /** By path relative to the apps folder, with the `.html`, as `sales/overview.html`. */
  apps: Map<string, Meta>;
  /** Old paths to new, as a page's URL has them, without `.html`; a folder's ends in `/`. See redirect.ts. */
  redirects: Redirects;
}

/** The problems said on the last read of the tree, and on this one. */
let previous = new Set<string>();
let current = new Set<string>();

/** A new read of the tree: a problem still there isn't said again; one fixed and made again is. */
export function startRead() {
  previous = current;
  current = new Set();
}

/** Say a problem once while it lasts, not on every read of the tree. */
export function warnOnce(message: string) {
  if (current.has(message)) return;
  current.add(message);
  if (!previous.has(message)) console.warn(`${metaFile}: ${message}`);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A key as a path relative to the apps folder: no leading `./` or `/`, no trailing slash. */
const normalize = (key: string) => key.replace(/^(\.?\/)+/, '').replace(/\/+$/, '');

/** A YAML scalar as text: `2024` is read as a number, but meant as a name or tag. */
const textOf = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value).trim()
    : '';

const knownIcons: ReadonlySet<string> = new Set(iconNames);

type Section = 'folders' | 'apps';

/** The fields that mean something for one kind only. */
const onlyFor = new Map<string, Section>([
  ['endorsed', 'apps'],
  ['collapsed', 'folders'],
  ['description', 'folders'],
]);

function entryMeta(key: string, value: unknown, kind: Section): Meta {
  const meta: Meta = { tags: [] };
  if (!isRecord(value)) {
    warnOnce(`"${key}" should be a mapping; ignored.`);
    return meta;
  }
  for (const [field, v] of Object.entries(value)) {
    const only = onlyFor.get(field);
    if (only && only !== kind) {
      warnOnce(`"${key}": ${field} applies to ${only === 'apps' ? 'Data Apps' : 'folders'} only; ignored.`);
    } else if (field === 'name') {
      const name = textOf(v);
      if (name) meta.name = name;
      else warnOnce(`"${key}": name should be a non-empty string.`);
    } else if (field === 'description') {
      const description = textOf(v);
      if (description) meta.description = description;
      else warnOnce(`"${key}": description should be a non-empty string.`);
    } else if (field === 'icon') {
      if (typeof v === 'string' && knownIcons.has(v.trim())) meta.icon = v.trim();
      else warnOnce(`"${key}": icon should be one of ${iconNames.join(', ')}.`);
    } else if (field === 'tags') {
      // A bad item is dropped alone, so the others still match a search.
      const list: unknown[] = Array.isArray(v) ? v : [];
      meta.tags = list.map(textOf).filter(Boolean);
      if (!Array.isArray(v) || meta.tags.length < list.length)
        warnOnce(`"${key}": tags should be a list of names.`);
    } else if (field === 'endorsed') {
      if (typeof v === 'boolean') meta.endorsed = v;
      else warnOnce(`"${key}": endorsed should be true or false.`);
    } else if (field === 'collapsed') {
      if (typeof v === 'boolean') meta.collapsed = v;
      else warnOnce(`"${key}": collapsed should be true or false.`);
    } else if (field === 'order') {
      if (typeof v === 'number' && Number.isFinite(v)) meta.order = v;
      else warnOnce(`"${key}": order should be a number.`);
    } else {
      warnOnce(`"${key}": unknown field "${field}".`);
    }
  }
  return meta;
}

function section(root: Record<string, unknown>, name: Section): Map<string, Meta> {
  const result = new Map<string, Meta>();
  const value = root[name];
  if (value === undefined || value === null) return result;
  if (!isRecord(value)) {
    warnOnce(`${name} should be a mapping from path to settings.`);
    return result;
  }
  for (const [key, v] of Object.entries(value)) {
    const rel = normalize(key);
    // `sales` and `sales/` are one folder: the last written would win, unseen.
    if (result.has(rel)) warnOnce(`"${key}" names "${rel}" again under ${name}; the last one wins.`);
    result.set(rel, entryMeta(key, v, name));
  }
  return result;
}

/**
 * A path under `redirects` as a page's URL has it: decoded, from the apps folder, no `.html`. A
 * folder's keeps its trailing slash, as that is what makes it one. Pasted URLs (`/apps/sales/x`) are
 * read too. None when nothing is left.
 */
function redirectPath(raw: string, key: string): string | undefined {
  const folder = raw.endsWith('/');
  let rel = raw
    .replace(/^\/apps\//, '')
    .replace(/^(\.?\/)+/, '')
    .replace(/\/+$/, '');
  if (/\.html$/i.test(rel)) {
    warnOnce(`redirects: "${key}": write "${raw}" as in the page's URL, without .html.`);
    rel = rel.replace(/\.html$/i, '');
  }
  if (!rel) return undefined;
  return folder ? `${rel}/` : rel;
}

function redirectsSection(root: Record<string, unknown>): Redirects {
  const result = new Map<string, string>();
  const value = root.redirects;
  if (value === undefined || value === null) return {};
  if (!isRecord(value)) {
    warnOnce('redirects should be a mapping from old path to new.');
    return {};
  }
  for (const [key, v] of Object.entries(value)) {
    const from = redirectPath(key.trim(), key);
    const target = textOf(v);
    const to = target ? redirectPath(target, key) : undefined;
    if (!from) {
      warnOnce(`redirects: "${key}" names no path; ignored.`);
    } else if (!to) {
      warnOnce(`redirects: "${key}" should give the path it moved to; ignored.`);
    } else if (from.endsWith('/') !== to.endsWith('/')) {
      warnOnce(
        from.endsWith('/')
          ? `redirects: "${key}" is a folder, so "${target}" should end in / too; ignored.`
          : `redirects: "${key}" is a Data App, so "${target}" should not end in /; ignored.`,
      );
    } else {
      if (result.has(from)) warnOnce(`redirects: "${key}" names "${from}" again; the last one wins.`);
      result.set(from, to);
    }
  }
  // `fromEntries`, not assignment, so a key such as `__proto__` stays a key.
  return Object.fromEntries(result);
}

/** A file's text, or none when it isn't there; one that can't be read is said. */
function readText(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      warnOnce(`can't read ${path.basename(file)}: ${(err as Error).message}`);
    return undefined;
  }
}

/** The manifest under the apps folder, or an empty one when there is none or it can't be read. */
export function readMeta(appsDir: string): MetaFile {
  const empty: MetaFile = { folders: new Map(), apps: new Map(), redirects: {} };
  const yaml = readText(path.join(appsDir, metaFile));
  const yml = readText(path.join(appsDir, altMetaFile));
  if (yaml !== undefined && yml !== undefined)
    warnOnce(`${altMetaFile} is ignored, as ${metaFile} is there.`);
  const text = yaml ?? yml;
  if (text === undefined) return empty;
  let root: unknown;
  try {
    root = parse(text);
  } catch (err) {
    warnOnce(`not valid YAML: ${(err as Error).message.split('\n')[0]}`);
    return empty;
  }
  if (root === null || root === undefined) return empty;
  if (!isRecord(root)) {
    warnOnce('should be a mapping with `folders`, `apps` and `redirects`.');
    return empty;
  }
  for (const field of Object.keys(root)) {
    if (field !== 'folders' && field !== 'apps' && field !== 'redirects')
      warnOnce(`unknown top-level field "${field}".`);
  }
  return {
    folders: section(root, 'folders'),
    apps: section(root, 'apps'),
    redirects: redirectsSection(root),
  };
}
