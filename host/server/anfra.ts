import { type Context, Hono, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Config } from './config.js';

/**
 * The core API ops a visitor may reach: what a Data App and the inspector need, and nothing else.
 * `core.show` lists the datasets the page provisions; `core.query` answers queries and field
 * suggestions; `core.query.export` makes a query's whole result a file and answers its link;
 * `core.lineage` traces fields through the repo's catalog, for `Anfra.lineage()` and the
 * inspector's Lineage tab. `core.search` is let through for one question only (`narrowedOps`).
 * Everything else anfra serves (ingest, validate, …) stays private to this server.
 */
export const allowedOps = new Set([
  'core.query',
  'core.query.export',
  'core.show',
  'core.lineage',
  'core.search',
]);

/**
 * Ops a visitor may ask only one exact question of. The Lineage tab draws each model's database
 * table, which `core.lineage` gives only for models a metric refers to: the catalog's models, with
 * their table and data source, fill in the rest. They say nothing `core.lineage` doesn't.
 */
export const narrowedOps: Record<string, string> = {
  'core.search': JSON.stringify({ query: ['type:aml.model'] }),
};

/** The request headers passed on to anfra. Nothing else crosses, cookies and Origin included. */
const forwardedHeaders = ['accept', 'content-type', 'x-request-id', 'traceparent'];

/** A fixed window per client: at most `limit` requests a minute. */
export function rateLimit(limit: number, clientOf: (c: Context) => string): MiddlewareHandler {
  const windows = new Map<string, { start: number; count: number }>();
  return async (c, next) => {
    const now = Date.now();
    const client = clientOf(c);
    let window = windows.get(client);
    if (!window || now - window.start >= 60_000) {
      window = { start: now, count: 0 };
      windows.set(client, window);
      // Forget clients whose window has passed, so the map stays as small as the traffic.
      if (windows.size > 10_000) for (const [k, w] of windows) if (now - w.start >= 60_000) windows.delete(k);
    }
    window.count += 1;
    if (window.count > limit) {
      c.header('Retry-After', String(Math.ceil((window.start + 60_000 - now) / 1000)));
      return c.json(
        { error: { code: 'rate_limited', message: 'Too many queries. Try again in a minute.' } },
        429,
      );
    }
    await next();
  };
}

/** Ask anfra one core API op, as this server: its own Host, only the headers it chooses. */
export function callAnfra(config: Config, op: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${config.anfraUrl}/api/${op}`, {
    method: 'POST',
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(120_000),
  });
}

/**
 * `/api`: the core API, as anfra answers it, for the ops this host lets through. Queries are
 * rate-limited per client.
 *
 * This is where a real host decides who is asking. `anfra serve` has no authentication of its own:
 * it trusts whoever reaches it, which is why it listens where only this server can. Check your
 * session here, and refuse what this reader may not do, before anything reaches anfra.
 */
export function coreApi(config: Config, clientOf: (c: Context) => string): Hono {
  const guard: MiddlewareHandler = async (c, next) => {
    const op = c.req.param('op') ?? '';
    if (c.req.method !== 'POST' || !allowedOps.has(op)) {
      return c.json({ error: { code: 'not_found', message: `${op} is not served here.` } }, 404);
    }
    // Your auth goes here.
    await next();
  };

  // After the body limit: an op let through for one question must ask exactly it.
  const narrow: MiddlewareHandler = async (c, next) => {
    const op = c.req.param('op') ?? '';
    const only = narrowedOps[op];
    if (only !== undefined) {
      let asked: string | undefined;
      try {
        asked = JSON.stringify(await c.req.json());
      } catch {}
      if (asked !== only) {
        return c.json({ error: { code: 'not_found', message: `${op} is not served here for that.` } }, 404);
      }
    }
    await next();
  };

  const forward: MiddlewareHandler = async (c) => {
    const headers: Record<string, string> = {};
    for (const name of forwardedHeaders) {
      const value = c.req.header(name);
      if (value) headers[name] = value;
    }
    let upstream: Response;
    try {
      upstream = await callAnfra(config, c.req.param('op') ?? '', {
        headers,
        body: await c.req.arrayBuffer(),
        signal: c.req.raw.signal,
      });
    } catch (err) {
      console.warn('anfra:', (err as Error).message);
      return c.json({ error: { code: 'unavailable', message: 'The anfra server did not answer.' } }, 502);
    }
    const response = new Response(upstream.body, { status: upstream.status });
    const type = upstream.headers.get('content-type');
    if (type) response.headers.set('content-type', type);
    response.headers.set('cache-control', 'no-store');
    return response;
  };

  const api = new Hono();
  api.use('/core.query', rateLimit(config.queryRateLimit, clientOf));
  // An export runs its query to the last row before it answers, holding the warehouse far longer
  // than a page of rows does: its own, tighter limit. No timeout of this server's own: the request
  // lasts as long as anfra takes or the browser waits.
  api.use('/core.query.export', rateLimit(config.exportRateLimit, clientOf));
  // Lineage may build the repo's catalog first, and the search reads it: each held to the query
  // limit, counted on its own.
  api.use('/core.lineage', rateLimit(config.queryRateLimit, clientOf));
  api.use('/core.search', rateLimit(config.queryRateLimit, clientOf));
  api.all('/:op', guard, bodyLimit({ maxSize: 256 * 1024 }), narrow, forward);
  api.all('*', (c) => c.json({ error: { code: 'not_found', message: 'Not served here.' } }, 404));
  return api;
}

/** The request headers a download passes on: what resuming one needs. */
const downloadRequestHeaders = ['range', 'if-range'];

/** The response headers a download passes back: the file, its name, and what resuming it needs. */
const downloadResponseHeaders = [
  'content-type',
  'content-length',
  'content-disposition',
  'content-range',
  'accept-ranges',
  'last-modified',
];

/**
 * `GET /exports/download/<token>/<name>`: an export's file, streamed from anfra. anfra makes its
 * export links at this host's origin (it runs with `ANFRA_SITE_URL` set to it), so the browser
 * follows them here. anfra's link is a bearer link: whoever has it may download until it expires.
 * A host whose readers sign in checks the session here too.
 */
export async function exportDownload(c: Context, config: Config): Promise<Response> {
  // Your auth goes here.
  const headers: Record<string, string> = {};
  for (const name of downloadRequestHeaders) {
    const value = c.req.header(name);
    if (value) headers[name] = value;
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${config.anfraUrl}${c.req.path}`, {
      method: c.req.method,
      headers,
      signal: c.req.raw.signal,
    });
  } catch (err) {
    console.warn('anfra:', (err as Error).message);
    return c.json({ error: { code: 'unavailable', message: 'The anfra server did not answer.' } }, 502);
  }
  const response = new Response(upstream.body, { status: upstream.status });
  for (const name of downloadResponseHeaders) {
    const value = upstream.headers.get(name);
    if (value) response.headers.set(name, value);
  }
  response.headers.set('cache-control', 'no-store');
  return response;
}

/** The versions serving, for deploy checks: this host's, and anfra's; 503 while anfra does not answer. */
export async function health(c: Context, config: Config, hostVersion: string) {
  try {
    const response = await callAnfra(config, 'core.version', {
      body: '{}',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`anfra answered ${response.status}`);
    const { version } = (await response.json()) as { version: string };
    return c.json({ host: hostVersion, anfra: version });
  } catch (err) {
    return c.json({ host: hostVersion, anfra: null, error: (err as Error).message }, 503);
  }
}
