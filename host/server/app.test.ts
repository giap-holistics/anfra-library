import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, mock, test } from 'node:test';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

const meta = `
apps:
  dashboards/overview.html: { order: 1 }
redirects:
  reports/: dashboards/
  reports/cashflow: archive/cashflow
  Fancy Demos/: Big Folder/
  old/sales-overview: reports/overview   # chained through reports/
  dashboards/funnel: archive/cashflow     # still a Data App
  gone/thing: nowhere/thing               # leads nowhere
  loop/a: loop/b
  loop/b: loop/a
  mixed/: dashboards                      # a folder to a Data App
  pasted.html: dashboards/overview.html   # .html, read anyway
`;

function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'host-redirects-'));
  const apps = path.join(dir, 'repo', 'apps');
  for (const rel of ['dashboards/overview', 'dashboards/funnel', 'archive/cashflow', 'Big Folder/app']) {
    mkdirSync(path.dirname(path.join(apps, rel)), { recursive: true });
    writeFileSync(path.join(apps, `${rel}.html`), `<title>${rel}</title>`);
  }
  writeFileSync(path.join(apps, 'dashboards/overview.jpg'), 'jpg');
  writeFileSync(path.join(apps, '_meta.yaml'), meta);
  const page = path.join(dir, 'page');
  mkdirSync(page);
  writeFileSync(
    path.join(page, 'index.html'),
    '<html><head><title>x</title></head><body>shell</body></html>',
  );
  writeFileSync(path.join(page, 'og-image.png'), 'png');
  return { dir, repo: path.join(dir, 'repo'), apps, page };
}

describe('redirects', () => {
  let tmp: ReturnType<typeof makeRepo>;
  let app: ReturnType<typeof createApp>;
  const warnings: string[] = [];

  before(() => {
    tmp = makeRepo();
    mock.method(console, 'warn', (message: string) => warnings.push(message));
    const config = loadConfig({ NODE_ENV: 'production', ANFRA_REPO: tmp.repo });
    app = createApp({ config, hostVersion: 'test', pageDir: tmp.page });
  });
  after(() => {
    mock.restoreAll();
    rmSync(tmp.dir, { recursive: true, force: true });
  });

  const location = async (url: string) => {
    const res = await app.request(url);
    return { status: res.status, location: res.headers.get('location'), res };
  };

  test('a moved folder: 301 to the new path, with the query', async () => {
    const { status, location: to, res } = await location('/apps/reports/overview?x=1&y=2');
    assert.equal(status, 301);
    assert.equal(to, '/apps/dashboards/overview?x=1&y=2');
    assert.equal(res.headers.get('cache-control'), 'public, max-age=3600');
  });

  test('an exact rule wins over its folder', async () => {
    assert.equal((await location('/apps/reports/cashflow')).location, '/apps/archive/cashflow');
  });

  test('a chain ends where the last rule says', async () => {
    assert.equal((await location('/apps/old/sales-overview')).location, '/apps/dashboards/overview');
  });

  test('names with spaces, encoded both ways', async () => {
    assert.equal((await location('/apps/Fancy%20Demos/app')).location, '/apps/Big%20Folder/app');
  });

  test('a .html key is read as the path without it', async () => {
    assert.equal((await location('/apps/pasted')).location, '/apps/dashboards/overview');
  });

  test('a live Data App is served, even when a rule names it', async () => {
    for (const url of ['/apps/dashboards/overview', '/apps/dashboards/funnel']) {
      const res = await app.request(url);
      assert.equal(res.status, 200, url);
      assert.match(await res.text(), /shell/);
    }
  });

  test('an unknown path, a dead end and a loop get the page, as before', async () => {
    for (const url of ['/apps/nothing/here', '/apps/gone/thing', '/apps/loop/a', '/apps/reports/missing']) {
      const res = await app.request(url);
      assert.equal(res.status, 200, url);
      assert.match(await res.text(), /shell/);
    }
  });

  test("a moved app's files redirect to the same name where it went", async () => {
    assert.equal(
      (await location('/host/files/reports/overview.jpg?v=abc')).location,
      '/host/files/dashboards/overview.jpg?v=abc',
    );
    assert.equal(
      (await location('/host/files/reports/cashflow.html')).location,
      '/host/files/archive/cashflow.html',
    );
    // No file of that name where it went: not found, as before.
    assert.equal((await location('/host/files/reports/cashflow.jpg')).status, 404);
    assert.equal((await location('/host/files/dashboards/overview.jpg')).status, 200);
  });

  test('/host/apps sends the redirects with the tree', async () => {
    const body = (await (await app.request('/host/apps')).json()) as {
      entries: unknown[];
      redirects: Record<string, string>;
    };
    assert.ok(Array.isArray(body.entries) && body.entries.length > 0);
    assert.equal(body.redirects['reports/'], 'dashboards/');
    assert.equal(body.redirects['reports/cashflow'], 'archive/cashflow');
    assert.equal(body.redirects.pasted, 'dashboards/overview');
    assert.equal(body.redirects['mixed/'], undefined);
  });

  test('what cannot work is said', () => {
    const said = (part: string) =>
      assert.ok(
        warnings.some((w) => w.includes(part)),
        `no warning: ${part}`,
      );
    said('"dashboards/funnel" is still a Data App');
    said('"gone/thing" leads to "nowhere/thing", which is no Data App');
    said('"loop/a" loops (loop/a → loop/b → loop/a)');
    said('"mixed/" is a folder, so "dashboards" should end in / too');
    said('without .html');
    assert.ok(!warnings.some((w) => w.includes('unknown top-level field')));
    assert.ok(!warnings.some((w) => w.includes('"reports/"')));
  });
});

describe('redirects in development', () => {
  test('/host/apps reads the manifest again on each request', async () => {
    const tmp = makeRepo();
    const warn = mock.method(console, 'warn', () => {});
    try {
      const app = createApp({ config: loadConfig({ ANFRA_REPO: tmp.repo }), hostVersion: 'test' });
      const redirects = async () =>
        ((await (await app.request('/host/apps')).json()) as { redirects: Record<string, string> }).redirects;
      assert.equal((await redirects())['reports/'], 'dashboards/');
      writeFileSync(path.join(tmp.apps, '_meta.yaml'), 'redirects:\n  sales/: dashboards/\n');
      assert.deepEqual(await redirects(), { 'sales/': 'dashboards/' });
      // Without the page, files still redirect.
      const res = await app.request('/host/files/sales/overview.jpg');
      assert.equal(res.headers.get('location'), '/host/files/dashboards/overview.jpg');
    } finally {
      warn.mock.restore();
      rmSync(tmp.dir, { recursive: true, force: true });
    }
  });
});
