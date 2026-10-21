import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';
import { coreApi } from './anfra.js';
import { loadConfig } from './config.js';

describe('the core API', () => {
  const asked: { url: string; body: string }[] = [];
  const api = coreApi(loadConfig({ ANFRA_URL: 'http://anfra.test' }), () => 'client');

  beforeEach(() => {
    asked.length = 0;
    mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
      asked.push({ url, body: new TextDecoder().decode(init.body as ArrayBuffer) });
      return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } });
    });
  });
  afterEach(() => mock.restoreAll());

  const post = (op: string, body: unknown) =>
    api.request(`/${op}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  test('core.lineage is passed through', async () => {
    const body = { targets: [{ parent: 'ecommerce', child: 'revenue' }] };
    const res = await post('core.lineage', body);
    assert.equal(res.status, 200);
    assert.deepEqual(asked, [{ url: 'http://anfra.test/api/core.lineage', body: JSON.stringify(body) }]);
  });

  test("core.search answers the catalog's models, and nothing else", async () => {
    const res = await post('core.search', { query: ['type:aml.model'] });
    assert.equal(res.status, 200);
    assert.equal(asked.length, 1);

    for (const body of [{ query: ['revenue'] }, { query: ['type:aml.model', 'x'] }, {}, 'type:aml.model']) {
      assert.equal((await post('core.search', body)).status, 404);
    }
    assert.equal(asked.length, 1);
  });

  test('other ops stay private', async () => {
    assert.equal((await post('core.ingest', {})).status, 404);
    assert.equal(asked.length, 0);
  });
});
