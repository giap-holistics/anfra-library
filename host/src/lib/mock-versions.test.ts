import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mockVersionsFor } from './mock-versions';

const NOW = Date.UTC(2026, 9, 20);

describe('mockVersionsFor', () => {
  it('lists the newest version first', () => {
    const times = mockVersionsFor(NOW).map((v) => v.createdAt.getTime());
    assert.deepEqual(
      times,
      [...times].sort((a, b) => b - a),
    );
  });

  it('marks only the newest version as current', () => {
    const versions = mockVersionsFor(NOW);
    assert.deepEqual(
      versions.filter((v) => v.current).map((v) => v.id),
      [versions[0]?.id],
    );
  });

  it('numbers versions from the oldest up, with unique ids', () => {
    const ids = mockVersionsFor(NOW).map((v) => v.id);
    assert.equal(ids[0], `v${ids.length}`);
    assert.equal(ids.at(-1), 'v1');
    assert.equal(new Set(ids).size, ids.length);
  });

  it('gives the same list for the same time', () => {
    assert.deepEqual(mockVersionsFor(NOW), mockVersionsFor(NOW));
  });

  it('gives every version a summary and at least one change', () => {
    for (const v of mockVersionsFor(NOW)) {
      assert.ok(v.summary.length > 0);
      assert.ok(v.changes.length > 0);
    }
  });
});
