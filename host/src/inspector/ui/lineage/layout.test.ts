import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { layoutKey, shapeOf } from './layout';

const graph = { nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'a->b' }] };
const sizes =
  (over: Record<string, { width: number; height: number }> = {}) =>
  (id: string) =>
    over[id] ?? { width: 240, height: 80 };

describe('layoutKey', () => {
  it('is the same for the same ids and sizes', () => {
    assert.equal(layoutKey(graph, sizes()), layoutKey({ ...graph }, sizes()));
  });

  it('changes when a card grows by a pixel', () => {
    assert.notEqual(layoutKey(graph, sizes()), layoutKey(graph, sizes({ b: { width: 240, height: 81 } })));
  });

  it('ignores a change under a pixel', () => {
    assert.equal(layoutKey(graph, sizes()), layoutKey(graph, sizes({ b: { width: 240.2, height: 80.4 } })));
  });

  it('changes with the ids, and keeps their order', () => {
    const other = { nodes: [{ id: 'b' }, { id: 'a' }], edges: graph.edges };
    assert.notEqual(layoutKey(graph, sizes()), layoutKey(other, sizes()));
    assert.notEqual(shapeOf(graph), shapeOf(other));
  });
});
