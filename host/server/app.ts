import { readFileSync } from 'node:fs';
import path from 'node:path';
import { getConnInfo } from '@hono/node-server/conninfo';
import { serveStatic } from '@hono/node-server/serve-static';
import { type Context, Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { coreApi, exportDownload, health } from './anfra.js';
import { catalog, type Read } from './catalog.js';
import { appsDir, type Config } from './config.js';
import { repoEvents } from './events.js';
import { appFile, serveAppFile, versionOf } from './files.js';
import { mcp } from './mcp.js';
import { appPreview, defaultImage, type Preview, withImageFile, withPreview } from './preview.js';
import { redirectOf } from './redirect.js';
import { rootApp } from './root.js';

export interface AppOptions {
  config: Config;
  hostVersion: string;
  /** The built page (`vite build`), served in production; in development Vite serves it. */
  pageDir?: string;
}

/**
 * The host's server: the core API (only what Data Apps need), the Data Apps themselves, read from
 * the repo's apps folder, anfra's MCP when asked for, and, in production, the page.
 */
export function createApp({ config, hostVersion, pageDir }: AppOptions) {
  const app = new Hono();
  const apps = appsDir(config);
  const production = config.mode === 'production';

  // Behind a proxy, the client is the address that proxy appended: the last in X-Forwarded-For.
  // Earlier entries come from the client itself, so they can't be trusted.
  const clientOf = (c: Context) =>
    (config.trustProxy && c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim()) ||
    getConnInfo(c).remote.address ||
    'unknown';

  app.route('/api', coreApi(config, clientOf));
  if (config.mcp) app.route('/', mcp(config));

  // An export's file, at the link anfra made for this host's origin.
  app.on(['GET', 'HEAD'], '/exports/download/*', (c) => exportDownload(c, config));

  // The Data App tree, its redirects, and each app's link preview. A deployed repo does not change,
  // so production reads them once.
  const previews = new Map<string, Preview>();
  const read: Read | undefined = production
    ? catalog(apps, (rel, html, name) =>
        previews.set(rel, withImageFile(appPreview(rel, html, name), rel, apps, config)),
      )
    : undefined;
  const current = () => read ?? catalog(apps);
  app.get('/host/apps', (c) => {
    const { entries, redirects } = current();
    return c.json({ entries, redirects }, 200, { 'Cache-Control': 'no-store' });
  });

  // A definition, or a file it refers to. A query, as a preview image's `?v=`, is not part of the path.
  // A file of a Data App since moved (`<old>.html`, its `<old>.jpg`), or in a folder since moved,
  // redirects to the file of the same name where it went.
  app.on(['GET', 'HEAD'], '/host/files/*', (c) => {
    const rel = decodeURIComponent(c.req.path.slice('/host/files/'.length));
    if (!appFile(apps, rel)) {
      const ext = /\.[^./]*$/.exec(rel)?.[0] ?? '';
      const to = redirectOf(current().redirects, rel.slice(0, rel.length - ext.length), (path) =>
        Boolean(appFile(apps, path + ext)),
      );
      if (to) return moved(c, `/host/files/${encodePath(to + ext)}`);
    }
    return serveAppFile(c, apps, rel, production ? 'short' : 'none');
  });

  // Live reload, in development: what changed in the repo, as server-sent events.
  if (!production) {
    const events = repoEvents(config.repoDir);
    app.get('/host/events', (c) =>
      streamSSE(c, async (stream) => {
        const unsubscribe = events.subscribe((event) => {
          void stream.writeSSE({ data: JSON.stringify(event) });
        });
        stream.onAbort(unsubscribe);
        // Keep the stream open, with a comment now and then so proxies don't close it.
        while (!stream.aborted) {
          await stream.write(': keep-alive\n\n');
          await stream.sleep(25_000);
        }
        unsubscribe();
      }),
    );
  }

  app.get('/health', (c) => health(c, config, hostVersion));
  app.all('/host/*', (c) => c.notFound());

  if (pageDir) {
    const index = readFileSync(path.join(pageDir, 'index.html'), 'utf8');
    // Hashed by Vite, so they never change under the same name.
    app.use(
      '/assets/*',
      serveStatic({
        root: pageDir,
        onFound: (_, c) => {
          c.header('Cache-Control', 'public, max-age=31536000, immutable');
        },
      }),
    );
    // The rest of public/: the favicon and sidebar logo, and the default preview image.
    app.get('/logo.svg', serveStatic({ root: pageDir }));
    app.get(defaultImage, serveStatic({ root: pageDir }));
    const defaultVersion = versionOf(path.join(pageDir, defaultImage));

    // An old link to a Data App since moved, renamed or removed, as the manifest's redirects say:
    // sent on, before the page, so a link preview's crawler finds the app too.
    app.get('/apps/*', async (c, next) => {
      const rel = definitionOf(c.req.path);
      const { apps: known, redirects } = current();
      const to =
        rel && !known.has(rel)
          ? redirectOf(redirects, rel.slice(0, -'.html'.length), (path) => known.has(`${path}.html`))
          : undefined;
      if (to) return moved(c, `/apps/${encodePath(to)}`);
      await next();
    });

    // The page itself: `/` (the root app, server/root.ts), and `/apps/<path>` for each Data App, with
    // its preview. Anything else is not here.
    const shell = (c: Context) => {
      const rel = c.req.path === '/' ? rootApp : definitionOf(c.req.path);
      const preview = rel ? previews.get(rel) : undefined;
      return c.html(withPreview(index, c, config, { preview, rel, defaultVersion }), 200, {
        'Cache-Control': 'no-cache',
      });
    };
    app.get('/', shell);
    app.get('/apps/*', shell);
  }

  return app;
}

const encodePath = (rel: string) => rel.split('/').map(encodeURIComponent).join('/');

/**
 * A 301 to where an old link went, with its query. Cached for an hour only, not for good as a
 * browser would a bare 301: a path moved away may come back, or move on.
 */
function moved(c: Context, to: string) {
  c.header('Cache-Control', 'public, max-age=3600');
  return c.redirect(to + new URL(c.req.url).search, 301);
}

/** The definition a page names, `/apps/<path>` for `<path>.html`, as the page reads it (src/lib/host.ts). */
function definitionOf(pathname: string): string | undefined {
  const rest = pathname.slice('/apps/'.length).replace(/\/+$/, '');
  if (!pathname.startsWith('/apps/') || !rest) return undefined;
  try {
    return `${rest.split('/').map(decodeURIComponent).join('/')}.html`;
  } catch {
    return undefined;
  }
}
