import type { Context } from 'hono';
import { textOf, titleOf } from './catalog.js';
import type { Config } from './config.js';
import { appFile, versionOf } from './files.js';

/**
 * What a link to a page shows where it is shared (Slack, social sites, chat apps). Their crawlers
 * run no script, so the page's tags are written into the HTML the server sends.
 */
export interface Preview {
  title: string;
  description: string;
  /** Absolute, or relative to the definition. */
  image?: string;
  /**
   * The file under the apps folder the image names, if it names one (relative to the definition, or
   * at /host/files/): its path, and its version, or none if it isn't there.
   */
  imageFile?: { rel: string; version?: string };
}

const site = 'Data Apps';
const siteDescription = 'Interactive Data Apps, built on anfra with coding agents.';
/** In public/, so Vite copies it into the built page. 1200x630, as Open Graph sites crop to. */
export const defaultImage = '/og-image.png';
/**
 * The size every preview image from this host is said to have, as no image is read to learn it:
 * the default, and a Data Folder's own, pre-rendered at 1200x630 by convention. Without a size,
 * Facebook may show no image the first time a link is shared.
 */
const imageSize = { width: '1200', height: '630' };
const imageTypes: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

// A `>` inside a quoted value does not end the tag.
const metaRe = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
const attrRe = /([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

/** A definition's `<meta>` tags, by name or property, each as text; the first of a name wins. */
function metaOf(html: string): Map<string, string> {
  const end = html.search(/<\/head>/i);
  const head = end < 0 ? html : html.slice(0, end);
  const found = new Map<string, string>();
  for (const [tag] of head.matchAll(metaRe)) {
    const attrs = new Map<string, string>();
    for (const m of tag.matchAll(attrRe))
      attrs.set((m[1] as string).toLowerCase(), m[2] ?? m[3] ?? m[4] ?? '');
    const key = (attrs.get('property') ?? attrs.get('name'))?.toLowerCase();
    const content = textOf(attrs.get('content') ?? '');
    if (key && content && !found.has(key)) found.set(key, content);
  }
  return found;
}

/**
 * A Data App's preview, from its definition: its `og:title`, written for sharing, else the manifest's
 * `name` (as the sidebar shows it), else its `<title>`; its `og:description` or `description`; its `og:image`.
 */
export function appPreview(rel: string, html: string, name?: string): Preview {
  const meta = metaOf(html);
  return {
    title: meta.get('og:title') ?? name ?? titleOf(html) ?? (rel.split('/').at(-1) as string),
    description: meta.get('og:description') ?? meta.get('description') ?? siteDescription,
    image: meta.get('og:image'),
  };
}

const filesPath = '/host/files/';
const encodePath = (rel: string) => rel.split('/').map(encodeURIComponent).join('/');
// Stands in for this host's origin, which only a request gives, to find the images under the apps folder.
const self = 'http://self.invalid';

/**
 * A preview with the file its image names under the apps folder, and that file's version, so a
 * crawler that caches images by URL fetches a changed one. A file that isn't there, or is outside
 * the apps folder, is said once, here; the page then shows the default image.
 */
export function withImageFile(preview: Preview, rel: string, appsDir: string, config: Config): Preview {
  if (!preview.image) return preview;
  let url: URL;
  let file: string;
  try {
    url = new URL(preview.image, self + filesPath + encodePath(rel));
    if (!url.pathname.startsWith(filesPath)) {
      // A path relative to the definition that climbs out of the apps folder names nothing here.
      if (url.origin !== self || preview.image.startsWith('/')) return preview;
      console.warn(
        `apps/${rel}: its og:image ${preview.image} is outside apps/; its link preview shows the default.`,
      );
      return { ...preview, image: undefined };
    }
    file = url.pathname.slice(filesPath.length).split('/').map(decodeURIComponent).join('/');
  } catch {
    return preview;
  }
  const found = appFile(appsDir, file);
  // Only an image on this host is said missing; another host's /host/files/ may well have it.
  if (!found && (url.origin === self || (config.siteUrl && url.href.startsWith(config.siteUrl + filesPath))))
    console.warn(`apps/${rel}: no file apps/${file} for its og:image; its link preview shows the default.`);
  return { ...preview, imageFile: { rel: file, version: found && versionOf(found.file) } };
}

/** Where readers reach this host: ANFRA_SITE_URL, else the request's origin, as the proxy saw it. */
function originOf(c: Context, config: Config): string {
  if (config.siteUrl) return config.siteUrl;
  const url = new URL(c.req.url);
  const proto = config.trustProxy && c.req.header('x-forwarded-proto')?.split(',').at(-1)?.trim();
  return proto === 'http' || proto === 'https' ? `${proto}://${url.host}` : url.origin;
}

/** An author's image as an absolute URL, relative to their definition; none if it is no URL at all. */
function imageOf(image: string | undefined, definitionUrl: string): string | undefined {
  if (!image) return undefined;
  try {
    return new URL(image, definitionUrl).href;
  } catch {
    return undefined;
  }
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** A URL with `?v=<version>`, when there is one. */
function versioned(url: string, version?: string): string {
  if (!version) return url;
  const u = new URL(url);
  u.searchParams.set('v', version);
  return u.href;
}

/** What a page shows: the Data App's preview, with `rel` its definition; none for the home page. */
export interface Page {
  preview?: Preview;
  rel?: string;
  /** The default image's version. */
  defaultVersion?: string;
}

/** The image a page shows, as an absolute URL, and whether it is one of this host's, of the known size. */
function imageFor(origin: string, { preview, rel, defaultVersion }: Page): { url: string; ours: boolean } {
  const fallback = { url: versioned(origin + defaultImage, defaultVersion), ours: true };
  const url = imageOf(preview?.image, origin + filesPath + encodePath(rel ?? ''));
  if (!url) return fallback;
  const file = preview?.imageFile;
  // Another host's image is shown as named.
  if (!file || !url.startsWith(origin + filesPath)) return { url, ours: false };
  return file.version ? { url: versioned(url, file.version), ours: true } : fallback;
}

/** The type an image's name says, for the formats Open Graph sites show; none for another. */
function typeOf(url: string): string | undefined {
  const ext = new URL(url).pathname.split('.').at(-1)?.toLowerCase();
  return ext ? imageTypes[ext] : undefined;
}

/** The page's index.html with a preview's tags in its head, in place of its `<title>`. */
export function withPreview(index: string, c: Context, config: Config, page: Page = {}): string {
  const { preview } = page;
  const origin = originOf(c, config);
  const image = imageFor(origin, page);
  const title = preview?.title ?? site;
  // A tag without a value is left out.
  const tags: [string, string, string | undefined][] = [
    ['name', 'description', preview?.description ?? siteDescription],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', site],
    ['property', 'og:title', title],
    ['property', 'og:description', preview?.description ?? siteDescription],
    // The path as requested: `c.req.path` is decoded, and a space would break the link.
    ['property', 'og:url', origin + new URL(c.req.url).pathname],
    // The image's own properties follow it, as Open Graph reads them.
    ['property', 'og:image', image.url],
    ['property', 'og:image:width', image.ours ? imageSize.width : undefined],
    ['property', 'og:image:height', image.ours ? imageSize.height : undefined],
    ['property', 'og:image:type', typeOf(image.url)],
    ['property', 'og:image:alt', title],
    ['name', 'twitter:card', 'summary_large_image'],
  ];
  const head = [
    `<title>${escapeHtml(preview ? `${title} · ${site}` : site)}</title>`,
    ...tags.flatMap(([attr, key, value]) =>
      value === undefined ? [] : [`<meta ${attr}="${key}" content="${escapeHtml(value)}" />`],
    ),
  ].join('\n    ');
  // A function, so a `$` in a title is not read as a replacement pattern.
  return /<title>[\s\S]*?<\/title>/i.test(index)
    ? index.replace(/<title>[\s\S]*?<\/title>/i, () => head)
    : index.replace(/<\/head>/i, () => `  ${head}\n  </head>`);
}
