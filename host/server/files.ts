import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Context } from 'hono';
import { getMimeType } from 'hono/utils/mime';

/**
 * The file a path under the apps folder names, or none: outside it (through symlinks too), a
 * dot-file or under a dot-directory, or not a regular file.
 */
export function appFile(
  appsDir: string,
  rel: string,
): { file: string; size: number; mtimeMs: number } | undefined {
  if (rel.split('/').some((part) => part === '' || part.startsWith('.'))) return undefined;
  try {
    const root = realpathSync(appsDir);
    const file = realpathSync(path.join(root, ...rel.split('/')));
    if (!file.startsWith(root + path.sep)) return undefined;
    const stat = statSync(file);
    return stat.isFile() ? { file, size: stat.size, mtimeMs: stat.mtimeMs } : undefined;
  } catch {
    return undefined;
  }
}

/** A short hash of a file's bytes, to version its URL: a changed file gets a new one. */
export const versionOf = (file: string) =>
  createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 10);

/**
 * Serve a file under the apps folder: a definition, as its author wrote it, or what it refers to
 * (an image, a script). Opened on its own it is sandboxed, so author code never runs as this
 * origin and reaches the API only through the host's bridge.
 */
export function serveAppFile(c: Context, appsDir: string, rel: string, cache: 'none' | 'short') {
  const found = appFile(appsDir, rel);
  if (!found) return c.notFound();

  c.header('Content-Security-Policy', 'sandbox allow-scripts');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Content-Type', getMimeType(found.file) ?? 'application/octet-stream');
  if (cache === 'none') {
    c.header('Cache-Control', 'no-store');
  } else {
    const etag = `W/"${found.size.toString(16)}-${Math.floor(found.mtimeMs).toString(16)}"`;
    c.header('Cache-Control', 'public, max-age=60');
    c.header('ETag', etag);
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304);
  }
  c.header('Content-Length', String(found.size));
  if (c.req.method === 'HEAD') return c.body(null);
  return c.body(Readable.toWeb(createReadStream(found.file)) as ReadableStream);
}
