import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { retryable } from './retryable';

describe('retryable', () => {
  it('asks again after a rejection', async () => {
    let calls = 0;
    const get = retryable(async () => {
      calls++;
      if (calls === 1) throw new Error('no chunk');
      return 'elk';
    });
    await assert.rejects(get(), /no chunk/);
    assert.equal(await get(), 'elk');
    assert.equal(calls, 2);
  });

  it('keeps what resolved', async () => {
    let calls = 0;
    const get = retryable(async () => ++calls);
    assert.equal(await get(), 1);
    assert.equal(await get(), 1);
    assert.equal(calls, 1);
  });

  it('shares a load still in flight', async () => {
    let calls = 0;
    const get = retryable(async () => ++calls);
    await Promise.all([get(), get()]);
    assert.equal(calls, 1);
  });
});
