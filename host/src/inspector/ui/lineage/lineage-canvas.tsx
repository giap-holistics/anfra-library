import '@xyflow/react/dist/style.css';
import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import type { ElkNode } from 'elkjs/lib/elk-api';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import {
  type LineageGraph,
  type LineageGraphEdge,
  lineageKinds,
  orderForLayout,
  pathOf,
} from '../../model/lineage';
import { layoutKey, shapeOf } from './layout';
import {
  type CrossHandles,
  crossHandleId,
  type LineageActions,
  LineageActionsContext,
  type LineageFlowNode,
  LineageNodeCard,
  type NodeTone,
} from './lineage-node';
import { retryable } from './retryable';

const nodeTypes = { lineage: LineageNodeCard };

const edgeColor = { normal: '#a78bfa', onPath: '#7c3aed' };
/** A control's edge says "filters", not "is built from": orange once the reader has set it, gray before. */
const filterEdgeColor = {
  set: { normal: '#fb923c', onPath: '#ea580c' },
  unset: { normal: '#e5e7eb', onPath: '#9ca3af' },
};
/** A cross-filter's edge, drawn like a control's: orange while a selection in its source is applied, light gray before. */
const crossFilterEdgeColor = {
  active: { normal: '#fb923c', onPath: '#ea580c' },
  inactive: { normal: '#e5e7eb', onPath: '#9ca3af' },
};

/** Each kind's colour on the minimap. */
const minimapColors: Record<string, string> = {
  control: '#f97316',
  block: '#6366f1',
  query: '#10b981',
  metric: '#14b8a6',
  dimension: '#0ea5e9',
  dataset: '#f59e0b',
  model: '#8b5cf6',
  table: '#64748b',
};

/** ELK, loaded with the first canvas: the layout engine is most of this tab's weight. */
// In a worker, so a large graph's layout doesn't freeze the page. A failed import is tried again.
export const loadElk = retryable(
  (): Promise<{ layout(graph: ElkNode): Promise<ElkNode> }> =>
    Promise.all([import('elkjs/lib/elk-api.js'), import('elkjs/lib/elk-worker.min.js?worker')]).then(
      ([{ default: ELK }, { default: ElkWorker }]) => new ELK({ workerFactory: () => new ElkWorker() }),
    ),
);

interface Props {
  /** The graph to draw, already filtered and focused. */
  graph: LineageGraph;
  /** The node whose path is pinned. */
  selected: string | undefined;
  /** A node to bring into view; a new nonce repeats a request for the same node. */
  centerOn?: { id: string; nonce: number };
  onSelect: (id: string | undefined) => void;
  actions: LineageActions;
  /** The large view's overview of the whole canvas. */
  minimap?: boolean;
}

/**
 * Whether the page is dark: the host sets `.dark` on the root, from the system or the reader's
 * toggle. React Flow's own `colorMode` would follow only the system.
 */
function useDarkPage(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => observer.disconnect();
    },
    () => document.documentElement.classList.contains('dark'),
  );
}

/** The lineage as a canvas: zoom, pan, and a click to pin a node's path. Each one has its own viewport. */
export function LineageCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <LineageActionsContext.Provider value={props.actions}>
        <Canvas {...props} />
      </LineageActionsContext.Provider>
    </ReactFlowProvider>
  );
}

function Canvas({ graph, selected, centerOn, onSelect, minimap = false }: Props) {
  const { fitView, getInternalNode, setCenter, getZoom } = useReactFlow();
  const dark = useDarkPage();
  const initialized = useNodesInitialized();
  const [nodes, setNodes, onNodesChange] = useNodesState<LineageFlowNode>([]);
  // Where ELK put each node, for the graph of this shape: a new shape is laid out again.
  const shape = useMemo(() => shapeOf(graph), [graph]);
  // `key` is the shape and the cards' sizes it was laid out for: a card that changes size is laid out again.
  const [layout, setLayout] = useState<{
    shape: string;
    key: string;
    at: Map<string, { x: number; y: number }>;
  }>();
  // Bumped when React Flow measures a card again, so the layout can compare sizes.
  const [measures, setMeasures] = useState(0);
  const laidOut = layout?.shape === shape ? layout.at : undefined;
  // Unseen until the first layout is placed and fitted, so the cards never show stacked at the origin.
  const [ready, setReady] = useState(false);
  // Why the layout failed, if it did; Retry bumps `attempt` to run it again.
  const [failure, setFailure] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  const path = useMemo(
    () => (selected && graph.nodes.some((n) => n.id === selected) ? pathOf(graph, selected) : undefined),
    [graph, selected],
  );

  // Each cross-filter edge's own points on its two queries, and its lane: the shorter the span, the
  // closer to the cards, so the loops nest instead of crossing.
  const crossOf = useMemo(() => {
    const out = new Map<string, CrossHandles>();
    const of = (id: string) => {
      const handles = out.get(id) ?? { out: [], in: [] };
      out.set(id, handles);
      return handles;
    };
    for (const e of graph.edges) {
      if (e.kind !== 'crossFilter') continue;
      of(e.source).out.push(e.id);
      of(e.target).in.push(e.id);
    }
    return out;
  }, [graph]);
  const lanes = useMemo(() => {
    const span = (e: LineageGraphEdge) =>
      Math.abs((laidOut?.get(e.source)?.y ?? 0) - (laidOut?.get(e.target)?.y ?? 0));
    const sorted = graph.edges.filter((e) => e.kind === 'crossFilter').sort((a, b) => span(a) - span(b));
    return new Map(sorted.map((e, i) => [e.id, i]));
  }, [graph, laidOut]);

  // Cards that ELK has placed at least once: only those may show before the current layout lands.
  const placed = useRef(new Set<string>());
  // The cards, drawn unseen until they are measured and laid out, then where ELK put them.
  useEffect(() => {
    setNodes((previous) => {
      const before = new Map(previous.map((n) => [n.id, n]));
      return graph.nodes.map((node) => {
        const tone: NodeTone = !path
          ? 'normal'
          : node.id === selected
            ? 'selected'
            : path.nodes.has(node.id)
              ? 'on-path'
              : 'dim';
        if (laidOut?.has(node.id)) placed.current.add(node.id);
        return {
          id: node.id,
          type: 'lineage',
          position: laidOut?.get(node.id) ?? before.get(node.id)?.position ?? { x: 0, y: 0 },
          data: { node, tone, cross: crossOf.get(node.id) },
          // A card ELK has not placed yet stays unseen; one already placed stays put until the new layout.
          style: laidOut || placed.current.has(node.id) ? undefined : { opacity: 0 },
        };
      });
    });
  }, [graph, path, selected, laidOut, crossOf, setNodes]);

  // Once every card has its size, lay the graph out top to bottom, a row per kind. A card that changes
  // size lays it out again, in place: `laidOut` stays, so the view isn't fitted again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` reruns a failed layout
  useEffect(() => {
    if (!initialized || graph.nodes.length === 0) return;
    // A card just added isn't measured yet: wait for it, as `initialized` turns again.
    if (graph.nodes.some((node) => !getInternalNode(node.id)?.measured?.height)) return;
    const key = layoutKey(graph, (id) => {
      const { width, height } = getInternalNode(id)?.measured ?? {};
      return width !== undefined && height !== undefined ? { width, height } : undefined;
    });
    if (laidOut && layout?.key === key) return;
    let cancelled = false;
    void loadElk()
      .then((engine) =>
        engine.layout({
          id: 'root',
          layoutOptions: {
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT',
            'elk.partitioning.activate': 'true',
            // One set of columns for the whole page: a block whose query reads nothing stays in the block column.
            'elk.separateConnectedComponents': 'false',
            'elk.layered.spacing.nodeNodeBetweenLayers': '80',
            'elk.spacing.nodeNode': '28',
            'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
            'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
          },
          children: orderForLayout(graph).map((node) => {
            const measured = getInternalNode(node.id)?.measured;
            return {
              id: node.id,
              width: measured?.width ?? 240,
              height: measured?.height ?? 80,
              layoutOptions: { 'elk.partitioning.partition': String(lineageKinds.indexOf(node.kind)) },
            };
          }),
          // A cross-filter joins two queries of one column: left out, so ELK keeps them there.
          edges: graph.edges
            .filter((e) => e.kind !== 'crossFilter')
            .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
        }),
      )
      .then(
        (result) => {
          if (cancelled) return;
          const at = new Map((result.children ?? []).map((c) => [c.id, { x: c.x ?? 0, y: c.y ?? 0 }]));
          setLayout({ shape, key, at });
        },
        (error: unknown) => {
          if (cancelled) return;
          console.error('Lineage layout failed', error);
          setFailure(error instanceof Error ? error.message : String(error));
        },
      );
    return () => {
      cancelled = true;
    };
  }, [initialized, laidOut, layout?.key, measures, graph, shape, getInternalNode, attempt]);

  const fitted = useRef(false);
  // The shape last fitted: a layout of the same shape (a card changed size) keeps the reader's view.
  const fittedShape = useRef<string | undefined>(undefined);
  // A new layout is fitted to the view, but never so small that cards can't be read: the large view
  // shows the rest.
  useEffect(() => {
    if (!laidOut) return;
    if (fittedShape.current === shape) return;
    fittedShape.current = shape;
    // The first layout lands in place; later ones glide.
    const duration = fitted.current ? 200 : 0;
    const frame = requestAnimationFrame(() => {
      void fitView({
        padding: 0.12,
        duration,
        maxZoom: 1,
        minZoom: minimap ? 0.2 : 0.6,
      });
      setReady(true);
    });
    fitted.current = true;
    return () => cancelAnimationFrame(frame);
  }, [laidOut, shape, fitView, minimap]);

  const centeredOn = useRef<number | undefined>(undefined);
  // Bring a requested node to the middle, once the layout is there, without zooming out from where the reader is.
  useEffect(() => {
    if (!centerOn || !laidOut || centeredOn.current === centerOn.nonce) return;
    const frame = requestAnimationFrame(() => {
      const internal = getInternalNode(centerOn.id);
      if (!internal) return;
      centeredOn.current = centerOn.nonce;
      const { x, y } = internal.internals.positionAbsolute;
      const { width = 0, height = 0 } = internal.measured;
      void setCenter(x + width / 2, y + height / 2, { zoom: Math.max(getZoom(), 0.8), duration: 250 });
    });
    return () => cancelAnimationFrame(frame);
  }, [centerOn, laidOut, getInternalNode, setCenter, getZoom]);

  const edges = useMemo<Edge[]>(() => {
    return graph.edges.map((e) => {
      const on = path?.edges.has(e.id) ?? false;
      const palette =
        e.kind === 'crossFilter'
          ? crossFilterEdgeColor[e.active ? 'active' : 'inactive']
          : e.kind === 'control'
            ? filterEdgeColor[e.active ? 'set' : 'unset']
            : edgeColor;
      const color = palette[on ? 'onPath' : 'normal'];
      const opacity = path && !on ? 0.15 : 1;
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        // Between two queries of one column: out of the right side and back into it, in a loop.
        ...(e.kind === 'crossFilter'
          ? {
              type: 'smoothstep',
              sourceHandle: crossHandleId('out', e.id),
              targetHandle: crossHandleId('in', e.id),
              pathOptions: { offset: 18 + 12 * (lanes.get(e.id) ?? 0), borderRadius: 8 },
            }
          : {}),
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color },
        style: {
          stroke: color,
          strokeWidth: on ? 2 : 1.25,
          opacity,
        },
        zIndex: on ? 1 : 0,
        focusable: false,
      };
    });
  }, [graph, path, lanes]);

  return (
    <div className="relative size-full">
      <ReactFlow
        nodes={nodes}
        // Edges draw as soon as their cards are measured, wherever those sit: wait for the layout.
        edges={laidOut ? edges : []}
        style={{ opacity: ready ? 1 : 0, transition: 'opacity 200ms' }}
        nodeTypes={nodeTypes}
        onNodesChange={(changes) => {
          onNodesChange(changes);
          if (changes.some((c) => c.type === 'dimensions')) setMeasures((n) => n + 1);
        }}
        onNodeClick={(_, node) => onSelect(node.id === selected ? undefined : node.id)}
        onPaneClick={() => onSelect(undefined)}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesFocusable={false}
        minZoom={0.1}
        maxZoom={2}
        colorMode={dark ? 'dark' : 'light'}
        className="bg-muted/30"
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <Controls showInteractive={false} position="bottom-left" />
        {minimap && (
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => minimapColors[(n as LineageFlowNode).data.node.kind] ?? '#94a3b8'}
            position="bottom-right"
          />
        )}
      </ReactFlow>
      {!ready && graph.nodes.length > 0 && failure !== undefined && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-sm">
          <span>Couldn't lay out the lineage.</span>
          <span className="text-xs text-muted-foreground">{failure}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFailure(undefined);
              setAttempt((n) => n + 1);
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {!ready && graph.nodes.length > 0 && failure === undefined && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Laying out lineage…
        </div>
      )}
    </div>
  );
}
