import { type Dirent, existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AppPrompt, Catalog, Entry } from './entry.js';
import { type Meta, type MetaFile, readMeta, startRead, warnOnce } from './meta.js';
import { followRedirects, type Redirects } from './redirect.js';

export type { Catalog, Entry };

const titleRe = /<title[^>]*>([\s\S]*?)<\/title>/i;
const metadataRe = /<script\b[^>]*\sid\s*=\s*["']?data-app-metadata["']?[^>]*>([\s\S]*?)<\/script>/i;

// The named entities a title or description is likely to hold; numeric ones are all decoded.
const entities: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  bull: '•',
  copy: '©',
  reg: '®',
  trade: '™',
};

const entityRe = /&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi;

/** An entity's character, or the entity as written when it names none. */
function decodeEntity(entity: string, dec?: string, hex?: string, name?: string): string {
  if (name) return entities[name] ?? entity;
  const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex as string, 16);
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
}

/** Text from HTML, as one line: whitespace collapsed, entities decoded. */
export function textOf(html: string): string {
  return html.split(/\s+/).filter(Boolean).join(' ').replace(entityRe, decodeEntity);
}

/** A definition's `<title>`, as text, or none. */
export function titleOf(html: string): string | undefined {
  const raw = titleRe.exec(html)?.[1];
  return raw ? textOf(raw) || undefined : undefined;
}

/** A definition's `<meta name="description">`, as text, or none. */
export function descriptionOf(html: string): string | undefined {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/\bname\s*=\s*["']?description["'\s>/]/i.test(tag)) continue;
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const text = content ? textOf(content[1] ?? content[2] ?? '') : '';
    if (text) return text;
  }
  return undefined;
}

/**
 * A definition's `<meta property="og:image">` as a URL the page can load from this host
 * (`/host/files/...`), when it names a file under the apps folder; else none.
 */
export function imageOf(html: string, rel: string, root: string): string | undefined {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/\bproperty\s*=\s*["']?og:image["'\s>/]/i.test(tag)) continue;
    const content = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
    const value = (content?.[1] ?? content?.[2] ?? '').trim();
    if (!value) continue;
    try {
      const base = 'http://self.invalid/';
      const url = new URL(value, `${base}${rel.split('/').map(encodeURIComponent).join('/')}`);
      if (url.origin !== 'http://self.invalid') return undefined;
      const file = url.pathname.slice(1).split('/').map(decodeURIComponent).join('/');
      const full = path.resolve(root, file);
      if (!full.startsWith(path.resolve(root) + path.sep) || !existsSync(full)) return undefined;
      return `/host/files/${file.split('/').map(encodeURIComponent).join('/')}`;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** The prompt that made a definition, from its `data-app-metadata` script, or none. */
export function promptOf(html: string, rel: string): AppPrompt | undefined {
  const raw = metadataRe.exec(html)?.[1];
  if (raw === undefined) return undefined;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    warnOnce(`"${rel}": its data-app-metadata isn't valid JSON; ignored.`);
    return undefined;
  }
  if (typeof data !== 'object' || data === null) return undefined;
  const fields = data as Record<string, unknown>;
  const text = (key: string) =>
    typeof fields[key] === 'string' && fields[key].trim() ? fields[key] : undefined;
  const prompt = text('prompt');
  if (!prompt) return undefined;
  return {
    prompt,
    model: text('model'),
    effort: text('effort'),
    createdAt: text('createdAt'),
    updatedAt: text('updatedAt'),
  };
}

/**
 * Called with each definition as the tree is read, so a caller needing its HTML reads it once.
 * `name` is the manifest's, if it gives one.
 */
type OnApp = (rel: string, html: string, name: string | undefined) => void;

interface Scan {
  meta: MetaFile;
  onApp?: OnApp;
  /** Every folder met, shown or not, to find what the manifest names that isn't there. */
  folders: Set<string>;
  /** Every definition met. */
  apps: Set<string>;
}

const noMeta: Meta = { tags: [] };

/** By `order`, the ordered first, lowest first. A stable sort keeps the rest as they came: by file name. */
function byOrder(a: { order?: number }, b: { order?: number }) {
  // Infinity - Infinity is NaN, when neither has an order.
  return (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY) || 0;
}

function scan(root: string, rel: string, ctx: Scan): Entry[] {
  let dirents: Dirent[];
  try {
    dirents = readdirSync(path.join(root, rel), { withFileTypes: true });
  } catch {
    return [];
  }
  dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const folders: { order?: number; entry: Entry }[] = [];
  const apps: { order?: number; entry: Entry }[] = [];
  for (const d of dirents) {
    if (d.name.startsWith('.')) continue;
    const childRel = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) {
      // A folder holding no Data App, at any depth, is left out.
      const children = scan(root, childRel, ctx);
      ctx.folders.add(childRel);
      if (children.length === 0) {
        if (ctx.meta.folders.has(childRel)) warnOnce(`"${childRel}" holds no Data App, so it isn't shown.`);
        continue;
      }
      const meta = ctx.meta.folders.get(childRel) ?? noMeta;
      const name = meta.name ?? d.name;
      folders.push({
        order: meta.order,
        entry: {
          kind: 'folder',
          path: childRel,
          name,
          description: meta.description,
          icon: meta.icon,
          tags: meta.tags,
          collapsed: meta.collapsed ?? false,
          children,
        },
      });
    } else if (d.isFile() && d.name.toLowerCase().endsWith('.html')) {
      const html = readFileSync(path.join(root, childRel), 'utf8');
      ctx.apps.add(childRel);
      const meta = ctx.meta.apps.get(childRel) ?? noMeta;
      ctx.onApp?.(childRel, html, meta.name);
      // The manifest's name, else the definition's `<title>`, else its file name.
      const label = meta.name ?? titleOf(html) ?? d.name;
      apps.push({
        order: meta.order,
        entry: {
          kind: 'app',
          path: childRel,
          label,
          description: descriptionOf(html),
          image: imageOf(html, childRel, root),
          icon: meta.icon,
          tags: meta.tags,
          endorsed: meta.endorsed ?? false,
          prompt: promptOf(html, childRel),
        },
      });
    }
  }
  // Folders first, then Data Apps, each by `order`, then by file name, as a file tree reads.
  return [...folders.sort(byOrder), ...apps.sort(byOrder)].map((item) => item.entry);
}

/** One read of the apps folder: what the page is sent, and every definition there, with its `.html`. */
export interface Read extends Catalog {
  apps: ReadonlySet<string>;
}

/**
 * Every Data App definition under the apps folder, as a tree, and the manifest's redirects. Paths
 * in the tree are relative to the apps folder, with their `.html`.
 */
export function catalog(appsDir: string, onApp?: OnApp): Read {
  startRead();
  const ctx: Scan = { meta: readMeta(appsDir), onApp, folders: new Set(), apps: new Set() };
  const entries = scan(appsDir, '', ctx);
  // Each section checked against its own kind, so a key under the wrong one is said, not ignored.
  for (const key of ctx.meta.folders.keys()) {
    if (ctx.folders.has(key)) continue;
    warnOnce(
      ctx.apps.has(key)
        ? `"${key}" is a Data App; move it under apps.`
        : `"${key}" under folders matches no folder.`,
    );
  }
  for (const key of ctx.meta.apps.keys()) {
    if (ctx.apps.has(key)) continue;
    warnOnce(
      ctx.folders.has(key)
        ? `"${key}" is a folder; move it under folders.`
        : `"${key}" under apps matches no Data App.`,
    );
  }
  checkRedirects(ctx.meta.redirects, ctx);
  return { entries, redirects: ctx.meta.redirects, apps: ctx.apps };
}

/**
 * Say what in the redirects can't work: an old path still there, so never redirected, and a new
 * one that leads nowhere, or back to itself, after any redirects from it.
 */
function checkRedirects(redirects: Redirects, ctx: Scan) {
  const isApp = (path: string) => ctx.apps.has(`${path}.html`);
  const isFolder = (path: string) => ctx.folders.has(path.slice(0, -1));
  for (const [from, to] of Object.entries(redirects)) {
    const folder = from.endsWith('/');
    if (folder ? isFolder(from) : isApp(from))
      warnOnce(
        folder
          ? `redirects: "${from}" is still a folder; only the Data Apps no longer in it are redirected.`
          : `redirects: "${from}" is still a Data App, so it isn't redirected.`,
      );
    if (folder && isFolder(to)) continue;
    // From the old path, so a chain that comes back to it is a loop.
    const followed = followRedirects(redirects, from, folder ? isFolder : isApp);
    if (followed.to) continue;
    const end = followed.chain.at(-1);
    warnOnce(
      followed.loop
        ? `redirects: "${from}" loops (${followed.chain.join(' → ')}); ignored.`
        : `redirects: "${from}" leads to "${end}", which is no ${folder ? 'folder' : 'Data App'}; ignored.`,
    );
  }
}
