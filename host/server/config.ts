import path from 'node:path';

/** What the host's server is told by its environment. */
export interface Config {
  /** Development (live reload, nothing cached) or production (read once, cached). */
  mode: 'development' | 'production';
  /** Where this server listens. */
  port: number;
  hostname: string;
  /** The anfra server answering the core API: `anfra serve --no-apps`, never on the public internet. */
  anfraUrl: string;
  /** The Data Folder anfra serves. Definitions are its `apps/**\/*.html`, read from disk by this server. */
  repoDir: string;
  /** Requests a minute one client may send to `core.query`, and to each of `core.lineage` and `core.search`. */
  queryRateLimit: number;
  /** Requests a minute one client may send to `core.query.export`. */
  exportRateLimit: number;
  /** Take the client's address from `X-Forwarded-For`, as the one proxy in front of this server appends it. */
  trustProxy: boolean;
  /** Pass anfra's MCP endpoint through at `/mcp`. */
  mcp: boolean;
  /** Where readers reach this host, for the absolute links in a page's preview; else each request's origin. */
  siteUrl?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const repoDir = path.resolve(env.ANFRA_REPO ?? '../demo-data');
  return {
    mode: env.NODE_ENV === 'production' ? 'production' : 'development',
    port: Number(env.PORT ?? 8787),
    hostname: env.HOSTNAME ?? '127.0.0.1',
    anfraUrl: (env.ANFRA_URL ?? 'http://127.0.0.1:7878').replace(/\/+$/, ''),
    repoDir,
    queryRateLimit: Number(env.QUERY_RATE_LIMIT ?? 120),
    exportRateLimit: Number(env.EXPORT_RATE_LIMIT ?? 10),
    trustProxy: env.TRUST_PROXY === '1',
    mcp: env.MCP === '1',
    siteUrl: siteUrlOf(env.ANFRA_SITE_URL),
  };
}

/** ANFRA_SITE_URL as an origin, checked here so a bad one stops the server rather than its pages. */
function siteUrlOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const url = URL.canParse(value) ? new URL(value) : undefined;
  if (url?.protocol !== 'http:' && url?.protocol !== 'https:')
    throw new Error(`ANFRA_SITE_URL must be an http(s) URL, as https://data.example.com: got ${value}`);
  return value.replace(/\/+$/, '');
}

export const appsDir = (config: Config) => path.join(config.repoDir, 'apps');
