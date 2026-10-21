import { Handle, type Node, type NodeProps, Position, useUpdateNodeInternals } from '@xyflow/react';
import {
  Box,
  Boxes,
  Crosshair,
  Database,
  ListTree,
  type LucideIcon,
  Ruler,
  ScanSearch,
  Shapes,
  Sigma,
  SlidersHorizontal,
  Table2,
  TableProperties,
  TriangleAlert,
} from 'lucide-react';
import { createContext, type ReactNode, useContext, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { LineageGraphNode, LineageKind } from '../../model/lineage';
import type { RevealTarget } from '../../model/types';
import { CodeBlock } from '../shared/code-block';

/** Each kind's name on its card, as the reader knows it. */
export const kindLabels: Record<LineageKind, string> = {
  control: 'Control',
  block: 'Block',
  query: 'Query',
  metric: 'Metric',
  dimension: 'Dimension',
  dataset: 'Dataset',
  model: 'Model',
  table: 'Database table',
};

/** Each kind's accent: the bar down a card's left edge, its filter chip's dot, and its icon's badge. */
export const kindAccents: Record<LineageKind, { bar: string; dot: string; pill: string }> = {
  control: {
    bar: 'border-l-orange-500',
    dot: 'bg-orange-500',
    pill: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  },
  block: {
    bar: 'border-l-indigo-500',
    dot: 'bg-indigo-500',
    pill: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  },
  query: {
    bar: 'border-l-emerald-500',
    dot: 'bg-emerald-500',
    pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  metric: {
    bar: 'border-l-teal-500',
    dot: 'bg-teal-500',
    pill: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  },
  dimension: {
    bar: 'border-l-sky-500',
    dot: 'bg-sky-500',
    pill: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  },
  dataset: {
    bar: 'border-l-amber-500',
    dot: 'bg-amber-500',
    pill: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  },
  model: {
    bar: 'border-l-violet-500',
    dot: 'bg-violet-500',
    pill: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300',
  },
  table: {
    bar: 'border-l-slate-500',
    dot: 'bg-slate-500',
    pill: 'bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300',
  },
};

/** Each kind's icon; blocks and queries keep the ones the Structure tab gives them. */
export const kindIcons: Record<LineageKind, LucideIcon> = {
  control: SlidersHorizontal,
  block: Shapes,
  query: Table2,
  metric: Sigma,
  dimension: Ruler,
  dataset: Boxes,
  model: Box,
  table: TableProperties,
};

/** A kind's icon in its colored badge. */
export function KindBadge({ kind, className }: { kind: LineageKind; className?: string }) {
  const Icon = kindIcons[kind];
  return (
    <span
      className={cn('grid size-5 shrink-0 place-items-center rounded', kindAccents[kind].pill, className)}
      role="img"
      aria-label={kindLabels[kind]}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

/** How a card stands against a pinned path: on it, the one picked, or off it. */
export type NodeTone = 'normal' | 'selected' | 'on-path' | 'dim';

/** The cross-filter edges that leave and enter a query, by edge id: each gets its own point on the card's right side. */
export interface CrossHandles {
  out: string[];
  in: string[];
}

export type LineageFlowNode = Node<
  { node: LineageGraphNode; tone: NodeTone; cross?: CrossHandles },
  'lineage'
>;

export const crossHandleId = (direction: 'out' | 'in', edgeId: string) => `${direction}:${edgeId}`;

/** What a card's hover buttons do, given once for every card. */
export interface LineageActions {
  locate: (structureKey: string) => void;
  reveal: (target: RevealTarget) => void;
  focus: (id: string) => void;
}

export const LineageActionsContext = createContext<LineageActions | undefined>(undefined);

/** One entity on the canvas: its kind, label and name, and what the catalog says of it. */
export function LineageNodeCard({ id, data }: NodeProps<LineageFlowNode>) {
  const { node, tone, cross } = data;
  const updateInternals = useUpdateNodeInternals();
  const slots = [
    ...(cross?.out ?? []).map((id) => ({ id: crossHandleId('out', id), type: 'source' as const })),
    ...(cross?.in ?? []).map((id) => ({ id: crossHandleId('in', id), type: 'target' as const })),
  ];
  const slotKey = slots.map((h) => h.id).join();
  useEffect(() => {
    if (slotKey) updateInternals(id);
  }, [slotKey, id, updateInternals]);
  const actions = useContext(LineageActionsContext);
  const mono = node.kind === 'table';
  return (
    <div
      className={cn(
        'group relative w-60 rounded-lg border border-l-[3px] bg-card text-card-foreground shadow-sm transition-[opacity,box-shadow]',
        kindAccents[node.kind].bar,
        tone === 'selected' && 'ring-2 ring-violet-500/70',
        tone === 'on-path' && 'border-violet-300 dark:border-violet-500/50',
        tone === 'dim' && 'opacity-30',
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-1 !min-h-0 !min-w-0 !border-0 !opacity-0"
      />
      <div className="space-y-1 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
          <KindBadge kind={node.kind} />
          {kindLabels[node.kind]}
        </div>
        <div className={cn('text-sm leading-tight font-semibold break-words', mono && 'font-mono')}>
          {node.label}
        </div>
        {node.name && node.name !== node.label && (
          <div className="truncate font-mono text-[11px] text-muted-foreground">{node.name}</div>
        )}
        {node.value && (
          <div
            className={cn(
              'flex items-baseline gap-1.5 rounded bg-muted px-2 py-1 text-xs',
              !node.isSet && 'text-muted-foreground italic',
            )}
          >
            <span className="text-[10px] tracking-wider text-muted-foreground uppercase not-italic">
              Value
            </span>
            <span className="min-w-0 font-mono break-words">{node.value}</span>
          </div>
        )}
        {node.pending && (
          <div className="font-mono text-[11px] break-words text-muted-foreground">
            pending: {node.pending}
          </div>
        )}
        {node.description && (
          <p className="line-clamp-3 text-xs leading-snug text-muted-foreground">{node.description}</p>
        )}
        {node.definition && (
          <div className="pt-1">
            <CodeBlock
              tab="aql"
              onTab={() => {}}
              className="nowheel max-h-28 px-2.5 py-2 pr-8 text-[11px] break-words whitespace-pre-wrap"
              sources={{ aql: { label: 'AQL', code: node.definition, lang: 'aql', empty: '' } }}
            />
          </div>
        )}
        {node.chips && node.chips.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {node.chips.map((chip) => (
              <span
                key={chip}
                className="rounded bg-violet-100 px-1.5 py-0.5 font-mono text-[10px] text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
              >
                {chip}
              </span>
            ))}
          </div>
        )}
        {node.error && (
          <div className="flex items-start gap-1 pt-1 text-[11px] text-amber-700 dark:text-amber-400">
            <TriangleAlert className="mt-px size-3 shrink-0" />
            <span className="line-clamp-2">Lineage: {node.error}</span>
          </div>
        )}
      </div>
      {actions && <HoverActions node={node} actions={actions} />}
      <Handle
        type="source"
        position={Position.Right}
        className="!size-1 !min-h-0 !min-w-0 !border-0 !opacity-0"
      />
      {slots.map((h, i) => (
        <Handle
          key={h.id}
          id={h.id}
          type={h.type}
          position={Position.Right}
          style={{ top: `${((i + 1) / (slots.length + 1)) * 100}%` }}
          className="!size-1 !min-h-0 !min-w-0 !border-0 !opacity-0"
        />
      ))}
    </div>
  );
}

/** Small buttons over a hovered card's corner: find it on the page, open it in its tab, or focus on it. */
function HoverActions({ node, actions }: { node: LineageGraphNode; actions: LineageActions }) {
  const { structureKey, entity } = node;
  const onPage = node.kind === 'block' || node.kind === 'query' || node.kind === 'control';
  return (
    <div className="nodrag absolute -top-3 right-2 hidden items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-sm group-hover:flex">
      {onPage && structureKey && (
        <ActionButton label="Locate on the page" onClick={() => actions.locate(structureKey)}>
          <Crosshair />
        </ActionButton>
      )}
      {onPage && structureKey && (
        <ActionButton label="Show in Structure" onClick={() => actions.reveal({ node: structureKey })}>
          <ListTree />
        </ActionButton>
      )}
      {entity && node.kind !== 'block' && (
        <ActionButton
          label={
            node.kind === 'query' || node.kind === 'control'
              ? 'Show in Queries'
              : `Show ${entity.name} in Queries`
          }
          onClick={() =>
            actions.reveal({
              entity: node.kind === 'control' ? 'control' : 'query',
              app: entity.app,
              name: entity.name,
            })
          }
        >
          <Database />
        </ActionButton>
      )}
      <ActionButton label="Focus on its lineage" onClick={() => actions.focus(node.id)}>
        <ScanSearch />
      </ActionButton>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          // The card's click pins its path; a button's is its own.
          onClick={(event) => {
            event.stopPropagation();
            onClick();
          }}
          className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-3.5"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
