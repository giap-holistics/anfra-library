import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Tables, tablesFor } from './tables';

const tables = { m: { table_name: 't', data_source_name: 'ds' } } as unknown as Tables;

describe('tablesFor', () => {
  it('keeps prior tables without asking', async () => {
    let calls = 0;
    const got = await tablesFor(tables, async () => {
      calls++;
      return {};
    });
    assert.deepEqual(got, { tables });
    assert.equal(calls, 0);
  });

  it('asks when there are none', async () => {
    assert.deepEqual(await tablesFor(undefined, async () => tables), { tables });
  });

  it('reports a failure, with no tables, and asks again next time', async () => {
    let calls = 0;
    const fetch = async () => {
      if (++calls === 1) throw new Error('offline');
      return tables;
    };
    assert.deepEqual(await tablesFor(undefined, fetch), { error: 'offline' });
    assert.deepEqual(await tablesFor(undefined, fetch), { tables });
    assert.equal(calls, 2);
  });
});
