import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Config } from './config.js';

/**
 * Tools refused on their way to anfra. `core.ingest` rebuilds the search catalog: up to half an
 * hour of work that any caller could start again and again.
 */
export const blockedTools = new Set(['core.ingest']);

/** The request headers passed on to anfra: MCP's own, and the ones `/api` passes. */
const forwardedHeaders = [
  'accept',
  'content-type',
  'last-event-id',
  'mcp-protocol-version',
  'mcp-session-id',
  'x-request-id',
  'traceparent',
];

/** The response headers passed back from anfra. */
const returnedHeaders = [
  'cache-control',
  'content-disposition',
  'content-length',
  'content-type',
  'mcp-session-id',
];

interface Message {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: { name?: unknown };
}

/** The JSON-RPC errors answering a body that calls a blocked tool; undefined when it calls none. */
function refusal(body: ArrayBuffer): Message[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return undefined; // not JSON: anfra refuses it
  }
  const messages = (Array.isArray(parsed) ? parsed : [parsed]) as Message[];
  const blocked = messages.find(
    (m) =>
      m?.method === 'tools/call' && typeof m.params?.name === 'string' && blockedTools.has(m.params.name),
  );
  if (!blocked) return undefined;
  const message = `${blocked.params?.name} is not served here.`;
  return messages
    .filter((m) => m?.id !== undefined)
    .map((m) => ({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message } }));
}

/** Pass one request to anfra at the same path, with only the headers chosen, and its answer back. */
async function forward(c: Context, config: Config, body?: ArrayBuffer): Promise<Response> {
  const headers: Record<string, string> = {};
  for (const name of forwardedHeaders) {
    const value = c.req.header(name);
    if (value) headers[name] = value;
  }
  let upstream: Response;
  try {
    upstream = await fetch(`${config.anfraUrl}${c.req.path}`, {
      method: c.req.method,
      headers,
      body,
      signal: c.req.raw.signal,
    });
  } catch (err) {
    console.warn('anfra:', (err as Error).message);
    return c.json({ error: { code: 'unavailable', message: 'The anfra server did not answer.' } }, 502);
  }
  const response = new Response(upstream.body, { status: upstream.status });
  for (const name of returnedHeaders) {
    const value = upstream.headers.get(name);
    if (value) response.headers.set(name, value);
  }
  return response;
}

/**
 * `/mcp`: anfra's MCP endpoint, passed through. Served only with `MCP=1`. The export files its
 * `core.query.export` links to download through `/exports/download/*`, served for Data Apps anyway
 * (`exportDownload` in anfra.ts).
 *
 * Unlike `/api`, this skips the host's allowlist and rate limit: every core op anfra serves as a
 * tool is reachable, except the blocked ones above, and nobody is asked who they are. Put your auth
 * in front of it before it serves anything but a demo. For export links to point here, anfra needs
 * `ANFRA_SITE_URL` set to this host's public URL.
 */
export function mcp(config: Config): Hono {
  const app = new Hono();
  app.post('/mcp', bodyLimit({ maxSize: 1024 * 1024 }), async (c) => {
    const body = await c.req.arrayBuffer();
    const errors = refusal(body);
    if (errors) return c.json(errors.length === 1 ? errors[0] : errors, 200);
    return forward(c, config, body);
  });
  // GET opens a session's stream of server messages; DELETE ends the session.
  app.on(['GET', 'DELETE'], '/mcp', (c) => forward(c, config));
  return app;
}
