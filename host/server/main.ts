import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { appsDir, loadConfig } from './config.js';

// The project root: above server/ when run from source, above dist/server/ when built.
const root = [path.resolve(import.meta.dirname, '..'), path.resolve(import.meta.dirname, '..', '..')].find(
  (dir) => existsSync(path.join(dir, 'package.json')),
) as string;
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };

const config = loadConfig();
if (!existsSync(appsDir(config))) {
  console.warn(`No apps folder at ${appsDir(config)}: set ANFRA_REPO to the Data Folder anfra serves.`);
}

const pageDir = path.join(root, 'dist', 'page');
if (config.mode === 'production' && !existsSync(path.join(pageDir, 'index.html'))) {
  console.error(`No built page at ${pageDir}: run pnpm build first.`);
  process.exit(1);
}

const app = createApp({
  config,
  hostVersion: version,
  pageDir: config.mode === 'production' ? pageDir : undefined,
});

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.hostname }, (info) => {
  console.log(`anfra host ${version} (${config.mode}) on http://${info.address}:${info.port}`);
  console.log(`  repo:  ${config.repoDir}`);
  console.log(`  anfra: ${config.anfraUrl}`);
  if (config.mode === 'development') console.log('  page:  http://localhost:5173 (Vite)');
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
