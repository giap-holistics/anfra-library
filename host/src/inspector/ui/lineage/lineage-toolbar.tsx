import { CircleHelp, Eye, EyeOff, Funnel, LoaderCircle, Maximize2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  hiddenCount,
  type LineageGraphNode,
  type LineageKind,
  type LineagePreset,
  lineageKinds,
  lineagePresets,
  matchPreset,
  showsCrossFilters,
} from '../../model/lineage';
import { KindBadge, kindLabels } from './lineage-node';

interface Props {
  /** How many of each kind the whole graph has: a kind it has none of gets no row in the Show menu. */
  counts: Partial<Record<LineageKind, number>>;
  hidden: ReadonlySet<LineageKind>;
  onHidden: (hidden: Set<LineageKind>) => void;
  crossFilters: boolean;
  /** How many cross-filters the whole graph has: with none, no row in the Show menu. */
  crossFilterCount: number;
  onCrossFilters: (shown: boolean) => void;
  onPreset: (preset: LineagePreset) => void;
  focus: LineageGraphNode | undefined;
  onClearFocus: () => void;
  loading: boolean;
  /** Opens the large view; absent in it. */
  onExpand?: () => void;
}

/** Above the canvas: a preset, a menu to show or hide each kind, what it is focused on, and the large view. */
export function LineageToolbar({
  counts,
  hidden,
  onHidden,
  crossFilters,
  crossFilterCount,
  onCrossFilters,
  onPreset,
  focus,
  onClearFocus,
  loading,
  onExpand,
}: Props) {
  const preset = matchPreset({ hidden, crossFilters });
  const toggle = (kind: LineageKind) => {
    const next = new Set(hidden);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    onHidden(next);
  };
  const hiddenTotal = hiddenCount({ hidden, crossFilters }, counts, crossFilterCount);
  const crossDrawn = showsCrossFilters({ hidden, crossFilters });
  return (
    <div className="space-y-1.5 border-b px-2 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Select
            value={preset?.id ?? 'custom'}
            onValueChange={(id) => {
              const picked = lineagePresets.find((p) => p.id === id);
              if (picked) onPreset(picked);
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label="Preset"
              className="w-44 min-w-0 shrink px-2 text-xs data-[size=sm]:h-7"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {!preset && (
                <SelectItem value="custom" disabled>
                  Custom
                </SelectItem>
              )}
              {lineagePresets.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 px-2 text-xs">
                {hiddenTotal > 0 ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                Show
                {hiddenTotal > 0 && (
                  <span className="text-muted-foreground tabular-nums">{hiddenTotal} hidden</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {lineageKinds
                .filter((kind) => counts[kind])
                .map((kind) => {
                  const shown = !hidden.has(kind);
                  return (
                    <DropdownMenuCheckboxItem
                      key={kind}
                      checked={shown}
                      onCheckedChange={() => toggle(kind)}
                      onSelect={(e) => e.preventDefault()}
                      className={cn('text-xs', !shown && 'text-muted-foreground')}
                    >
                      <KindBadge
                        kind={kind}
                        className={cn('size-4 [&_svg]:size-3', !shown && 'bg-muted text-muted-foreground')}
                      />
                      {kindLabels[kind]}
                      <span className="ml-auto text-muted-foreground tabular-nums">{counts[kind]}</span>
                      {shown ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              {crossFilterCount > 0 && (
                <DropdownMenuCheckboxItem
                  checked={crossFilters}
                  onCheckedChange={(v) => onCrossFilters(v === true)}
                  onSelect={(e) => e.preventDefault()}
                  className={cn('text-xs', !crossDrawn && 'text-muted-foreground')}
                >
                  <span className="flex size-4 items-center justify-center">
                    <Funnel
                      className={cn('size-3', crossDrawn ? 'text-orange-500' : 'text-muted-foreground')}
                    />
                  </span>
                  Cross-filters
                  <span className="ml-auto text-muted-foreground tabular-nums">
                    {crossFilters && !crossDrawn ? 'with queries' : crossFilterCount}
                  </span>
                  {crossDrawn ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </DropdownMenuCheckboxItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {loading && (
            <LoaderCircle className="size-3.5 animate-spin text-muted-foreground" aria-label="Tracing" />
          )}
          <EdgeLegend />
          {onExpand && (
            <Button variant="ghost" size="icon-xs" aria-label="Open in a large view" onClick={onExpand}>
              <Maximize2 />
            </Button>
          )}
        </div>
      </div>
      {focus && (
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Focused on</span>
          <span className="flex min-w-0 items-center gap-1 rounded-md bg-violet-100 py-0.5 pr-0.5 pl-2 font-medium text-violet-800 dark:bg-violet-500/20 dark:text-violet-200">
            <span className="truncate">
              {kindLabels[focus.kind]}: {focus.label}
            </span>
            <button
              type="button"
              aria-label="Show everything"
              onClick={onClearFocus}
              className="rounded p-0.5 hover:bg-violet-200 dark:hover:bg-violet-500/30"
            >
              <X className="size-3" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/** What an arrow means: the kinds of edge, drawn as they are on the canvas. */
function EdgeLegend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="What the arrows mean">
          <CircleHelp />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 text-xs">
        <LegendRow
          line={<line x1="0" y1="6" x2="40" y2="6" stroke="#a78bfa" strokeWidth="1.5" />}
          title="Is built from"
        >
          Points from what uses to what it uses: a block draws a query, a query returns a field, a field comes
          from a dataset, a model, a table.
        </LegendRow>
        <LegendRow
          line={<line x1="0" y1="6" x2="40" y2="6" stroke="#fb923c" strokeWidth="1.5" />}
          title="Filters, with a value"
        >
          A control the reader has set, mapped to a query: its value, shown on the control's card, changes
          that query's numbers. The control is not part of where they come from.
        </LegendRow>
        <LegendRow
          line={<line x1="0" y1="6" x2="40" y2="6" stroke="#e5e7eb" strokeWidth="1.5" />}
          title="Filters, not set"
        >
          The control is mapped to the query but has no value yet, so it changes nothing for now.
        </LegendRow>
        <LegendRow
          line={<line x1="0" y1="6" x2="40" y2="6" stroke="#fb923c" strokeWidth="1.5" />}
          title="Cross-filter, active"
        >
          A selection in the source query is applied, so it filters the target query's numbers.
        </LegendRow>
        <LegendRow
          line={<line x1="0" y1="6" x2="40" y2="6" stroke="#e5e7eb" strokeWidth="1.5" />}
          title="Cross-filter, inactive"
        >
          The queries are linked but nothing is selected in the source yet. Shown when cross-filters are on.
        </LegendRow>
      </PopoverContent>
    </Popover>
  );
}

function LegendRow({ line, title, children }: { line: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 font-medium">
        <svg width="44" height="12" aria-hidden="true">
          {line}
        </svg>
        {title}
      </div>
      <p className="text-muted-foreground">{children}</p>
    </div>
  );
}
