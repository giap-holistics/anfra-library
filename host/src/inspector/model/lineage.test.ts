import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import type {
  ColumnMeta,
  InspectedApp,
  InspectedStructure,
  LineageResult,
} from '@holistics/anfra-sdk/common';
import {
  buildLineageGraph,
  filterGraph,
  focusGraph,
  hiddenCount,
  type LineageCatalog,
  type LineageGraph,
  lineagePresets,
  lineageTargets,
  matchPreset,
  orderForLayout,
  pathOf,
  showsCrossFilters,
  targetKey,
} from './lineage';
import type { ModelTable } from './types';

// What core.lineage answered for ecommerce.revenue, ecommerce.order_count and orders.status.
const answered: LineageResult = JSON.parse(
  readFileSync(new URL('./fixtures/ecommerce-lineage.json', import.meta.url), 'utf8'),
);

const column = (fieldName: string, modelId?: string, extra: Partial<ColumnMeta> = {}): ColumnMeta =>
  ({
    name: fieldName,
    fieldName,
    modelId,
    label: fieldName,
    adhoc: false,
    isMeasure: !modelId,
    ...extra,
  }) as ColumnMeta;

const app = {
  title: 'Sales',
  declaration: {
    queries: {
      revenueByStatus: { dataset: 'ecommerce', aql: '' },
      orders: { dataset: 'ecommerce', aql: '' },
      later: { dataset: 'ecommerce', aql: '' },
    },
    filters: {},
    dateDrills: {},
    mappings: [],
  },
  queries: {
    revenueByStatus: {
      columns: [column('status', 'orders'), column('revenue'), column('x', undefined, { adhoc: true })],
    },
    orders: { columns: [column('order_count')] },
    later: { columns: [] },
  },
} as unknown as InspectedApp;

const structure: InspectedStructure = {
  nodes: [
    {
      key: '0',
      kind: 'block',
      id: 'revenue',
      label: 'Revenue',
      problems: [],
      children: [{ key: '0.0', kind: 'query', app: 0, name: 'revenueByStatus', problems: [], children: [] }],
    },
    { key: '1', kind: 'block', id: 'kpis', problems: [], children: [] },
  ],
  usage: {
    'query:0/orders': { markers: 1, blocks: ['kpis'] },
    'query:0/later': { markers: 1, blocks: ['kpis'] },
  },
};

const model = (fqn: string, table: string): ModelTable => ({
  model: { fqn, name: fqn, label: fqn },
  table,
  dataSource: 'ecommerce_duckdb',
});

const catalog: LineageCatalog = {
  traced: new Map(answered.results.map((r) => [targetKey(r.target), r])),
  tables: {
    orders: model('orders', 'public.orders'),
    order_items: model('order_items', 'public.order_items'),
    products: model('products', 'public.products'),
  },
};

const graph = buildLineageGraph([app], structure, catalog, undefined, { ecommerce: 'E-commerce' });
const ids = (g: LineageGraph) => g.nodes.map((n) => n.id).sort();
const edgeIds = (g: LineageGraph) => g.edges.map((e) => e.id).sort();

describe('lineage', () => {
  test('targets: each field once, ad hoc columns left out', () => {
    assert.deepEqual(lineageTargets([app]), [
      { parent: 'ecommerce', child: 'order_count' },
      { parent: 'ecommerce', child: 'revenue' },
      { parent: 'orders', child: 'status' },
    ]);
  });

  test('a control links to the queries it is mapped to, carrying their fields', () => {
    const withControl = {
      ...app,
      controls: {
        status: { condition: { values: ['paid'] }, appliedCondition: { values: ['paid'] }, isDirty: false },
        other: { condition: undefined },
      },
      declaration: {
        ...app.declaration,
        mappings: [
          {
            kind: 'control',
            from: { kind: 'filter', name: 'status' },
            to: { name: 'orders' },
            field: 'orders.status',
          },
          { kind: 'control', from: { kind: 'filter', name: 'gone' }, to: { name: 'missing' }, field: 'x' },
        ],
      },
    } as unknown as InspectedApp;
    const g = buildLineageGraph([withControl], structure, undefined, undefined);
    assert.equal(g.nodes.find((n) => n.id === 'control:0/status')?.kind, 'control');
    assert.equal(g.nodes.find((n) => n.id === 'control:0/status')?.isSet, true);
    assert.equal(
      g.nodes.some((n) => n.id === 'control:0/gone'),
      false,
    );
    assert.deepEqual(g.edges.find((e) => e.id === 'control:0/status->query:0/orders')?.fields, [
      'metric:ecommerce.order_count',
    ]);
  });

  describe('a control follows the applied condition', () => {
    const build = (control: Record<string, unknown>) => {
      const withControl = {
        ...app,
        controls: { status: control },
        declaration: {
          ...app.declaration,
          mappings: [
            {
              kind: 'control',
              from: { kind: 'filter', name: 'status' },
              to: { name: 'orders' },
              field: 'orders.status',
            },
          ],
        },
      } as unknown as InspectedApp;
      const g = buildLineageGraph([withControl], structure, undefined, undefined);
      return {
        card: g.nodes.find((n) => n.id === 'control:0/status'),
        edge: g.edges.find((e) => e.id === 'control:0/status->query:0/orders'),
      };
    };
    const paid = { values: ['paid'] };

    test('typed but not applied: not set, with the typed value pending', () => {
      const { card, edge } = build({ condition: paid, appliedCondition: undefined, isDirty: true });
      assert.equal(card?.isSet, false);
      assert.equal(card?.value, 'not set');
      assert.equal(edge?.active, false);
      assert.match(card?.pending ?? '', /paid/);
    });

    test('applied then cleared: still set, with the clearing pending', () => {
      const { card, edge } = build({ condition: undefined, appliedCondition: paid, isDirty: true });
      assert.equal(card?.isSet, true);
      assert.equal(edge?.active, true);
      assert.match(card?.value ?? '', /paid/);
      assert.equal(card?.pending, 'not set');
    });

    test('applied and clean: set, nothing pending', () => {
      const { card, edge } = build({ condition: paid, appliedCondition: paid, isDirty: false });
      assert.equal(card?.isSet, true);
      assert.equal(edge?.active, true);
      assert.equal(card?.pending, undefined);
    });
  });

  test('a cross-filter links two queries, active while its source is selected', () => {
    const base = {
      ...app,
      declaration: {
        ...app.declaration,
        mappings: [
          { kind: 'crossFilter', id: 'x1', from: { name: 'orders' }, to: { name: 'orders' } },
          { kind: 'crossFilter', id: 'x2', from: { name: 'orders' }, to: { name: 'missing' } },
        ],
      },
    };
    const idle = buildLineageGraph([base as unknown as InspectedApp], structure, undefined, undefined);
    const edge = idle.edges.find((e) => e.kind === 'crossFilter');
    assert.equal(edge?.id, 'crossFilter:0/x1');
    assert.equal(edge?.active, false);
    assert.equal(idle.edges.filter((e) => e.kind === 'crossFilter').length, 1);

    const applied = { ...base, appliedSelection: { source: 'orders' } } as unknown as InspectedApp;
    const live = buildLineageGraph([applied], structure, undefined, undefined);
    assert.equal(live.edges.find((e) => e.kind === 'crossFilter')?.active, true);

    assert.equal(
      filterGraph(live, new Set(), { crossFilters: false }).edges.some((e) => e.kind === 'crossFilter'),
      false,
    );
    assert.equal(
      filterGraph(live, new Set(['block']), { crossFilters: true }).edges.some(
        (e) => e.kind === 'crossFilter',
      ),
      true,
    );
    assert.equal(
      filterGraph(live, new Set(['query']), { crossFilters: true }).edges.some(
        (e) => e.kind === 'crossFilter',
      ),
      false,
    );
  });

  test('layout order puts cross-filtered queries side by side', () => {
    const q = (id: string) => ({ id, kind: 'query' as const, label: id });
    const e = (source: string, target: string) => ({
      id: `${source}->${target}`,
      source,
      target,
      fields: [],
      kind: 'crossFilter' as const,
    });
    const nodes = [q('a'), q('b'), q('c'), { id: 'm', kind: 'metric' as const, label: 'm' }];
    const order = orderForLayout({ nodes, edges: [e('a', 'c')] }).map((n) => n.id);
    assert.deepEqual(order, ['a', 'c', 'b', 'm']);
    assert.equal(orderForLayout({ nodes, edges: [] }), nodes);
  });

  test('presets match the view they set, and only that', () => {
    for (const p of lineagePresets)
      assert.equal(matchPreset({ hidden: new Set(p.hidden), crossFilters: p.crossFilters })?.id, p.id);
    assert.equal(matchPreset({ hidden: new Set(['table']), crossFilters: false }), undefined);
  });

  test('the hidden count counts only what the graph has', () => {
    const counts = { block: 2, query: 3, metric: 1 };
    // No cross-filters in the graph: turning them off hides nothing.
    assert.equal(hiddenCount({ hidden: new Set(), crossFilters: false }, counts, 0), 0);
    // Cross-filters there and off: one hidden.
    assert.equal(hiddenCount({ hidden: new Set(), crossFilters: false }, counts, 2), 1);
    // A hidden kind the graph has none of is not counted.
    assert.equal(hiddenCount({ hidden: new Set(['table']), crossFilters: true }, counts, 2), 0);
    // Hiding queries hides their cross-filters too, toggle on or not.
    assert.equal(hiddenCount({ hidden: new Set(['query']), crossFilters: true }, counts, 2), 2);
  });

  test('cross-filters are drawn only with the toggle and the queries', () => {
    assert.equal(showsCrossFilters({ hidden: new Set(), crossFilters: true }), true);
    assert.equal(showsCrossFilters({ hidden: new Set(), crossFilters: false }), false);
    assert.equal(showsCrossFilters({ hidden: new Set(['query']), crossFilters: true }), false);
  });

  test('the page down to its tables, shared models and tables once', () => {
    assert.deepEqual(ids(graph), [
      'block:kpis',
      'block:revenue',
      'dataset:ecommerce',
      'dimension:orders.status',
      'metric:ecommerce.order_count',
      'metric:ecommerce.revenue',
      'model:order_items',
      'model:orders',
      'model:products',
      'query:0/later',
      'query:0/orders',
      'query:0/revenueByStatus',
      'table:ecommerce_duckdb/public.order_items',
      'table:ecommerce_duckdb/public.orders',
      'table:ecommerce_duckdb/public.products',
    ]);
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    assert.deepEqual(byId.get('model:orders')?.chips, ['id', 'status']);
    assert.deepEqual(byId.get('model:order_items')?.chips, ['quantity']);
    assert.equal(byId.get('dataset:ecommerce')?.label, 'E-commerce');
    assert.equal(byId.get('block:revenue')?.structureKey, '0');
    assert.equal(byId.get('query:0/revenueByStatus')?.structureKey, '0.0');
  });

  test("a metric's path reaches the models it reads, not every model of its dataset", () => {
    const path = pathOf(graph, 'metric:ecommerce.revenue');
    assert.deepEqual([...path.nodes].sort(), [
      'block:revenue',
      'dataset:ecommerce',
      'metric:ecommerce.revenue',
      'model:order_items',
      'model:products',
      'query:0/revenueByStatus',
      'table:ecommerce_duckdb/public.order_items',
      'table:ecommerce_duckdb/public.products',
    ]);
  });

  test("a model's path goes up through the fields that read it", () => {
    const path = pathOf(graph, 'model:orders');
    assert.deepEqual([...path.nodes].sort(), [
      'block:kpis',
      'block:revenue',
      'dataset:ecommerce',
      'dimension:orders.status',
      'metric:ecommerce.order_count',
      'model:orders',
      'query:0/orders',
      'query:0/revenueByStatus',
      'table:ecommerce_duckdb/public.orders',
    ]);
  });

  describe('a cross-filter is not lineage', () => {
    // `orders` (order_count) cross-filters `revenueByStatus` (revenue, status): different metrics.
    const crossed = buildLineageGraph(
      [
        {
          ...app,
          declaration: {
            ...app.declaration,
            mappings: [
              {
                kind: 'crossFilter',
                id: 'x1',
                from: { name: 'orders' },
                to: { name: 'revenueByStatus' },
              },
            ],
          },
        } as unknown as InspectedApp,
      ],
      structure,
      catalog,
      undefined,
    );

    test('pinning the source shows what it filters, not what that is built from', () => {
      const path = pathOf(crossed, 'query:0/orders');
      assert.deepEqual([...path.nodes].sort(), [
        'block:kpis',
        'dataset:ecommerce',
        'metric:ecommerce.order_count',
        'model:orders',
        'query:0/orders',
        'query:0/revenueByStatus',
        'table:ecommerce_duckdb/public.orders',
      ]);
      assert.ok(path.edges.has('crossFilter:0/x1'));
    });

    test('pinning the target walks up through the cross-filter to its source', () => {
      const path = pathOf(crossed, 'query:0/revenueByStatus');
      assert.ok(path.nodes.has('query:0/orders'));
      assert.ok(path.edges.has('crossFilter:0/x1'));
      assert.ok(path.nodes.has('metric:ecommerce.revenue'));
      assert.ok(path.nodes.has('model:products'));
      assert.ok(!path.nodes.has('metric:ecommerce.order_count'));
    });
  });

  test('a query that has not run still links to its block', () => {
    assert.ok(pathOf(graph, 'query:0/later').nodes.has('block:kpis'));
  });

  test('hiding a kind joins across it, keeping what each edge carries', () => {
    const shown = filterGraph(graph, new Set(['query', 'dataset']));
    assert.ok(!ids(shown).some((id) => id.startsWith('query:') || id.startsWith('dataset:')));
    assert.ok(edgeIds(shown).includes('block:revenue->metric:ecommerce.revenue'));
    assert.ok(edgeIds(shown).includes('metric:ecommerce.revenue->model:products'));
    assert.ok(!edgeIds(shown).includes('metric:ecommerce.revenue->model:orders'));
    assert.ok(!edgeIds(shown).includes('block:revenue->metric:ecommerce.order_count'));
  });

  describe('hiding a kind keeps a filter edge a filter edge', () => {
    const controlled = (condition: unknown) => {
      const withControl = {
        ...app,
        controls: { status: { condition, appliedCondition: condition, isDirty: false } },
        declaration: {
          ...app.declaration,
          mappings: [
            {
              kind: 'control',
              from: { kind: 'filter', name: 'status' },
              to: { name: 'orders' },
              field: 'orders.status',
            },
          ],
        },
      } as unknown as InspectedApp;
      return buildLineageGraph([withControl], structure, catalog, undefined);
    };

    test('a control joins across a hidden query as a control, set or not', () => {
      for (const [condition, active] of [
        [{ values: ['paid'] }, true],
        [undefined, false],
      ] as const) {
        const shown = filterGraph(controlled(condition), new Set(['query']));
        const joined = shown.edges.find((e) => e.id === 'control:0/status->metric:ecommerce.order_count');
        assert.equal(joined?.kind, 'control');
        assert.equal(joined?.active, active);
      }
    });

    test('a filter edge and a plain edge between the same nodes both survive', () => {
      const edge = (id: string, source: string, target: string, extra = {}) => ({
        id,
        source,
        target,
        fields: ['f'],
        ...extra,
      });
      const node = (id: string, kind: LineageGraph['nodes'][number]['kind']) => ({ id, kind, label: id });
      const crowded: LineageGraph = {
        nodes: [node('x', 'block'), node('mid', 'query'), node('mid2', 'query'), node('y', 'metric')],
        edges: [
          edge('x->mid', 'x', 'mid'),
          edge('mid->y', 'mid', 'y'),
          edge('x->mid2', 'x', 'mid2', { kind: 'control', active: true }),
          edge('mid2->y', 'mid2', 'y'),
        ],
      };
      const shown = filterGraph(crowded, new Set(['query']));
      assert.deepEqual(
        shown.edges.map((e) => [e.id, e.kind]).sort(),
        [
          ['x->y', undefined],
          ['x->y:control', 'control'],
        ].sort(),
      );
      // The same, in the other order.
      const swapped = {
        ...crowded,
        edges: [...crowded.edges.slice(2), ...crowded.edges.slice(0, 2)],
      };
      assert.deepEqual(
        filterGraph(swapped, new Set(['query']))
          .edges.map((e) => [e.id, e.kind])
          .sort(),
        [
          ['x->y', undefined],
          ['x->y:control', 'control'],
        ].sort(),
      );
    });

    test('two joined control edges merge: fields are the union, active the OR', () => {
      const edge = (id: string, source: string, target: string, fields: string[], active: boolean) => ({
        id,
        source,
        target,
        fields,
        kind: 'control' as const,
        active,
      });
      const node = (id: string, kind: LineageGraph['nodes'][number]['kind']) => ({ id, kind, label: id });
      const two: LineageGraph = {
        nodes: [node('c', 'control'), node('q1', 'query'), node('q2', 'query'), node('m', 'metric')],
        edges: [
          edge('c->q1', 'c', 'q1', ['a'], false),
          edge('c->q2', 'c', 'q2', ['b'], true),
          { id: 'q1->m', source: 'q1', target: 'm', fields: ['a'] },
          { id: 'q2->m', source: 'q2', target: 'm', fields: ['b'] },
        ],
      };
      const [joined, ...rest] = filterGraph(two, new Set(['query'])).edges;
      assert.equal(rest.length, 0);
      assert.ok(joined);
      assert.equal(joined.id, 'c->m');
      assert.deepEqual([...joined.fields].sort(), ['a', 'b']);
      assert.equal(joined.active, true);
    });
  });

  test('focus keeps the node and its path', () => {
    const focused = focusGraph(graph, 'metric:ecommerce.order_count');
    assert.deepEqual(ids(focused), [
      'block:kpis',
      'dataset:ecommerce',
      'metric:ecommerce.order_count',
      'model:orders',
      'query:0/orders',
      'table:ecommerce_duckdb/public.orders',
    ]);
  });

  test('without the catalog, a dimension still reaches its model, a metric stops at its dataset', () => {
    const bare = buildLineageGraph([app], structure, undefined, undefined);
    assert.ok(ids(bare).includes('model:orders'));
    assert.ok(!ids(bare).some((id) => id.startsWith('table:')));
    assert.deepEqual(
      bare.edges.filter((e) => e.source === 'dataset:ecommerce').map((e) => e.target),
      ['model:orders'],
    );
  });
});
