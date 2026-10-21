import type { ColumnMeta, InspectedQuery, QueryDeclaration } from '@holistics/anfra-sdk/common';
import {
  Binary,
  Boxes,
  Braces,
  Calendar,
  CalendarClock,
  ChartColumn,
  ChevronRight,
  CircleHelp,
  GitFork,
  Hash,
  ListFilter,
  type LucideIcon,
  Sigma,
  SlidersHorizontal,
  Table2,
  ToggleLeft,
  Type,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { dedent } from '../../model/declaration-code';
import { plural, prettyJson } from '../../model/format';
import { declaredFilters, type QueryInput } from '../../model/inputs';
import type { RequestEntry } from '../../model/requests';
import { queryTrust, TRUST_LEVELS } from '../../model/trust';
import type { MetricDoc, MetricDocs, RevealTarget } from '../../model/types';
import { AgoTime } from '../shared/ago-time';
import { CodeBlock } from '../shared/code-block';
import { EntityLink } from '../shared/entity-link';
import { Field, Fields, InfoHint } from '../shared/fields';
import { MiniTable } from '../shared/mini-table';
import { stateDot, toneText } from '../shared/tone';
import { TrustBars } from '../shared/trust-bars';
import { MapsTo } from './control-row';
import { Drawn, EntityRow, type RowProps } from './entity-row';
import { RequestList } from './request-list';

type CodeTab = 'declared' | 'aql' | 'sql' | 'signature';

/** The icon of a column's semantic type. */
const typeIcon: Record<ColumnMeta['semantic_type'], LucideIcon> = {
  text: Type,
  number: Hash,
  date: Calendar,
  datetime: CalendarClock,
  truefalse: ToggleLeft,
  bit: Binary,
  json: Braces,
  unknown: CircleHelp,
};

export function QueryRow({
  query,
  declaration,
  inputs,
  crossTargets,
  requests,
  canViewSql,
  metricDocs,
  onReveal,
  ...props
}: RowProps & {
  query: InspectedQuery;
  declaration: QueryDeclaration | undefined;
  inputs: QueryInput[];
  /** The queries it cross-filters. */
  crossTargets: { query: string; self: boolean }[];
  /** This query's requests, newest first. */
  requests: { entry: RequestEntry; shared: boolean }[];
  /** Whether the reader may see generated SQL; without it, none comes back. */
  canViewSql: boolean;
  /** What the catalog says of each metric, by dataset. */
  metricDocs: MetricDocs | undefined;
  onReveal: (target: RevealTarget) => void;
}) {
  // Opens on what ran; each query keeps its own tab.
  const [codeTab, setCodeTab] = useState<CodeTab>('aql');
  // The newest run that ended, however it did; one another query may have made isn't this one's.
  const latest = requests.find(
    ({ entry, shared }) => !shared && entry.call === 'core.submitQuery' && entry.status !== 'pending',
  )?.entry;
  const rows = query.state === 'success' ? query.rowCount.toLocaleString() : '—';
  const notRun = query.state === 'success' || query.state === 'error' ? 'Not returned.' : 'Not run yet.';
  const trust = queryTrust(declaration, query);
  // When it ran, where its rows came from, and how long that took: one line, whichever parts are known.
  const lastRun = [
    query.debug?.executedAt && <AgoTime at={query.debug.executedAt} />,
    query.debug && (query.debug.fromCache ? 'cache' : 'database'),
    latest?.durationMs !== undefined && `${latest.durationMs} ms`,
  ].filter(Boolean);
  const allFilters = [...declaredFilters(declaration?.aql), ...inputs];
  const activeFilters = allFilters.filter(isActive);
  // Opens on the filters that narrow the query now; the rest is one click away.
  const [filterView, setFilterView] = useState<'active' | 'all'>('active');
  const filters = filterView === 'active' ? activeFilters : allFilters;

  const summary = (
    <>
      <span className="min-w-0 truncate font-medium">{props.name}</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{rows}</span>
        </TooltipTrigger>
        <TooltipContent>
          {query.state === 'success' ? plural(query.rowCount, 'row') : 'No rows yet'}
        </TooltipContent>
      </Tooltip>
      {/* A flag takes room only when there is one. */}
      {query.isDirty ? (
        <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">dirty</span>
      ) : (
        query.debug?.fromCache && <span className="shrink-0 text-xs text-muted-foreground">cache</span>
      )}
      <span className="flex-1" />
      {/* A span, not a button: the summary is already one. */}
      <Tooltip>
        <TooltipTrigger asChild>
          {/* biome-ignore lint/a11y/useSemanticElements: a <button> can't sit inside the row's own button */}
          <span
            role="button"
            tabIndex={0}
            aria-label="Show in Lineage"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-focus-within:opacity-100 group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onReveal({ lineage: 'query', app: props.app, name: props.name });
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              event.stopPropagation();
              onReveal({ lineage: 'query', app: props.app, name: props.name });
            }}
          >
            <GitFork className="size-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">Show in Lineage</TooltipContent>
      </Tooltip>
      {/* An empty slot when nothing narrows the query, so the icons after it stay in line. */}
      {activeFilters.length === 0 ? (
        <span className="w-9 shrink-0" aria-hidden />
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex w-9 shrink-0 items-center justify-end gap-1 text-xs text-muted-foreground tabular-nums">
              {activeFilters.length}
              <ListFilter className="size-3.5 shrink-0" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="left">
            <div className="space-y-0.5">
              <div>{plural(activeFilters.length, 'filter')} applied</div>
              <ul>
                {activeFilters.map((input, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: two filters can share a field and source
                  <li key={`${input.kind}:${input.source}:${input.field}:${index}`}>
                    {input.field}
                    <span className="opacity-70">
                      {' '}
                      · {input.kind === 'declared' ? 'query' : input.self ? 'itself' : input.source}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            className="flex h-3 w-6 shrink-0 items-end justify-end"
            aria-label={`Trust level ${trust.level}`}
          >
            <TrustBars trust={trust} size="sm" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="left">
          Level {trust.level} · {TRUST_LEVELS[trust.level].name}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            aria-label={`State: ${query.state}`}
            className={cn('size-2 shrink-0 rounded-full', stateDot[query.state])}
          />
        </TooltipTrigger>
        <TooltipContent>{query.state}</TooltipContent>
      </Tooltip>
    </>
  );
  // An error shows open or not: it is what a failing app is inspected for.
  const below = query.error && (
    <p className="px-3 pb-1.5 text-xs break-words text-destructive" role="alert">
      {query.error.name}
      {query.error.status !== undefined && ` (${query.error.status})`}: {query.error.message}
    </p>
  );

  return (
    <EntityRow kind="query" summary={summary} below={below} {...props}>
      <Fields>
        <Field label="Trust">
          <span className={cn('font-medium', toneText[trust.tone])}>
            Level {trust.level} · {TRUST_LEVELS[trust.level].name}
          </span>
          <span className="block text-muted-foreground">{trust.text}</span>
        </Field>
        <Field label="Dataset">
          <span className="inline-flex items-center gap-1.5">
            <Boxes className="size-3.5 shrink-0 text-muted-foreground" />
            {declaration?.dataset || 'none declared'}
          </span>
        </Field>
        {lastRun.length > 0 && (
          <Field label="Last run">
            {lastRun.map((part, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered line
              <span key={i}>
                {i > 0 && ' · '}
                {part}
              </span>
            ))}
          </Field>
        )}
        <Field label="On the page">
          <Drawn
            kind="query"
            app={props.app}
            name={props.name}
            usage={props.usage}
            blockKey={props.blockKey}
            onReveal={onReveal}
            onLocate={props.onLocate}
          />
        </Field>
        <Field label="Cross-filters">
          <MapsTo
            app={props.app}
            targets={crossTargets}
            onReveal={onReveal}
            empty={<span className="text-muted-foreground">No query</span>}
          />
        </Field>
        {query.selectedRowCount > 0 && <Field label="Selected">{query.selectedRowCount} rows</Field>}
        {(query.hasMore || query.page > 1) && (
          <Field label="Page">
            {query.page}
            {query.hasMore && ', more available'}
          </Field>
        )}
      </Fields>

      {query.columns.length === 0 ? (
        <Section title="Definition">
          <p className="text-xs text-muted-foreground">
            {notRun === 'Not run yet.' ? 'Known once it runs.' : 'No fields.'}
          </p>
        </Section>
      ) : (
        <>
          <FieldList
            title="Metrics"
            columns={query.columns.filter((column) => column.isMeasure)}
            docs={metricDocs?.[declaration?.dataset ?? '']}
          />
          <FieldList
            title="Dimensions"
            columns={query.columns.filter((column) => !column.isMeasure)}
            docs={metricDocs?.[declaration?.dataset ?? '']}
          />
        </>
      )}

      {allFilters.length > 0 && (
        <Section
          title="Filters"
          count={filters.length}
          action={
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={filterView}
              // Clicking the pressed item clears a single group; a view is always one of the two.
              onValueChange={(value) => value && setFilterView(value as 'active' | 'all')}
            >
              <ToggleGroupItem value="active" className="h-6 min-w-0 px-2 text-xs">
                Active ({activeFilters.length})
              </ToggleGroupItem>
              <ToggleGroupItem value="all" className="h-6 min-w-0 px-2 text-xs">
                All ({allFilters.length})
              </ToggleGroupItem>
            </ToggleGroup>
          }
        >
          {filters.length === 0 && <p className="text-xs text-muted-foreground">No active filters.</p>}
          {filters.length > 0 && (
            <MiniTable
              rows={filters.map((input, index) => {
                const Icon =
                  input.kind === 'declared'
                    ? Table2
                    : input.kind === 'control'
                      ? SlidersHorizontal
                      : ChartColumn;
                const column = filteredColumn(query.columns, input.field);
                const fieldType = column?.semantic_type ?? input.type;
                const FieldIcon = column?.isMeasure
                  ? Sigma
                  : (typeIcon[fieldType ?? 'unknown'] ?? CircleHelp);
                const fieldKind = column?.isMeasure ? 'metric' : `dimension · ${fieldType ?? 'unknown type'}`;
                const from =
                  input.kind === 'declared'
                    ? "Declared in this query's AQL filters block"
                    : input.kind === 'control'
                      ? `Applied from the control "${input.source}"`
                      : input.self
                        ? "Cross-filter from selecting rows in this query's own result"
                        : `Cross-filter from selecting rows in "${input.source}"`;
                return {
                  key: `${input.kind}:${input.source}:${input.field}:${index}`,
                  cells: [
                    <div key="field" className="flex min-w-0 items-start gap-2.5">
                      <TypeIcon icon={FieldIcon} label={fieldKind} />
                      <span className="font-medium break-all">{input.field}</span>
                    </div>,
                    <div key="applied" className="min-w-0">
                      <span
                        className={cn(
                          input.value === 'not set' || input.value === 'no selection'
                            ? 'text-muted-foreground'
                            : '',
                        )}
                      >
                        {input.value}
                      </span>
                      {input.pending && (
                        <div className="text-xs text-amber-600 dark:text-amber-400">
                          pending: {input.pending}
                        </div>
                      )}
                    </div>,
                    // The tooltip covers the icon and the source's name, so hovering either shows it.
                    <Tooltip key="from">
                      <TooltipTrigger asChild>
                        <div className="flex min-w-0 items-start gap-2.5">
                          <span
                            role="img"
                            aria-label={from}
                            className="inline-flex h-5 items-center text-muted-foreground"
                          >
                            <Icon className="size-3.5 shrink-0" />
                          </span>
                          {input.kind === 'declared' ? (
                            <span className="text-muted-foreground">query</span>
                          ) : input.self ? (
                            <span className="text-muted-foreground">itself</span>
                          ) : (
                            <EntityLink
                              entity={input.kind === 'control' ? 'control' : 'query'}
                              app={props.app}
                              name={input.source}
                              onReveal={onReveal}
                            />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left">{from}</TooltipContent>
                    </Tooltip>,
                  ],
                };
              })}
            />
          )}
        </Section>
      )}

      <Section
        title="Query"
        info="The AQL the query declares and the AQL, SQL and signature of its last run."
        defaultOpen={false}
      >
        <CodeBlock
          tab={codeTab}
          onTab={setCodeTab}
          sources={{
            declared: {
              label: 'Declared AQL',
              code: declaration?.aql && dedent(declaration.aql),
              lang: 'aql',
              empty: 'Not declared.',
            },
            aql: { label: 'Executed AQL', code: query.debug?.executedAql, lang: 'aql', empty: notRun },
            sql: {
              label: 'Executed SQL',
              code: query.debug?.executedSql,
              lang: 'sql',
              empty: canViewSql ? notRun : 'Needs canViewGeneratedSql.',
            },
            signature: { label: 'Signature', code: prettyJson(query.signature), empty: 'No signature.' },
          }}
        />
      </Section>

      {requests.length > 0 && (
        <Section
          title="Requests"
          info="What the app asked of the data source for this query, newest first."
          count={requests.length}
          defaultOpen={false}
        >
          <RequestList items={requests} />
        </Section>
      )}
    </EntityRow>
  );
}

/** The returned column a filter's field names, if the query returns it: its type is then known for sure. */
function filteredColumn(columns: ColumnMeta[], field: string): ColumnMeta | undefined {
  // An aggregated mapping reads `sum(model.field)`; the field is what's inside.
  const bare = /^\w+\((.*)\)$/.exec(field)?.[1] ?? field;
  return columns.find(
    (column) => (column.modelId ? `${column.modelId}.${column.fieldName}` : column.fieldName) === bare,
  );
}

/** Whether a filter narrows the query now: a declared one always does, an input only once it has a value. */
const isActive = (input: QueryInput) =>
  input.kind === 'declared' || (input.value !== 'not set' && input.value !== 'no selection');

/** A titled, collapsible part of an opened query, with a hint on what it holds. */
function Section({
  title,
  info,
  count,
  action,
  defaultOpen = true,
  children,
}: {
  title: string;
  info?: string;
  count?: number;
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group/section space-y-2">
      <div className="flex items-center gap-1 text-sm font-medium">
        <CollapsibleTrigger className="flex items-center gap-1 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/section:rotate-90" />
          {title}
        </CollapsibleTrigger>
        {info && (
          <InfoHint label={`About ${title.toLowerCase()}`} side="bottom">
            {info}
          </InfoHint>
        )}
        {count !== undefined && <span className="font-normal text-muted-foreground">· {count}</span>}
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <CollapsibleContent className="space-y-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}

/** An icon that says what it stands for on hover. */
function TypeIcon({ icon: Icon, label, className }: { icon: LucideIcon; label: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          className={cn('inline-flex h-5 items-center text-muted-foreground', className)}
        >
          <Icon className="size-3.5 shrink-0" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

/** The metrics or dimensions a query returns, one card row each; nothing renders when there are none. */
function FieldList({
  title,
  columns,
  docs,
}: {
  title: string;
  columns: ColumnMeta[];
  /** What the query's dataset says of its fields: with it, a row opens to show it. */
  docs?: Record<string, MetricDoc>;
}) {
  if (columns.length === 0) return null;
  return (
    <Section title={title} count={columns.length}>
      <ul className="divide-y rounded-lg border bg-background">
        {columns.map((column) => {
          const Icon = column.isMeasure ? Sigma : (typeIcon[column.semantic_type] ?? CircleHelp);
          const kind = column.isMeasure
            ? `metric${column.aggregation ? ` · ${column.aggregation}` : ''}`
            : `dimension · ${column.semantic_type}`;
          const unlabelled = !column.label || column.label === column.name;
          const summary = (
            <>
              <TypeIcon icon={Icon} label={kind} />
              <span className="min-w-0 truncate font-medium">{column.name}</span>
              {column.adhoc && <span className="shrink-0 text-amber-600 dark:text-amber-400">ad hoc</span>}
              <span className="ml-auto flex min-w-0 items-center pl-2">
                {unlabelled ? (
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900 dark:bg-amber-400/20 dark:text-amber-300">
                    no label
                  </span>
                ) : (
                  <span className="truncate text-muted-foreground">{column.label}</span>
                )}
              </span>
            </>
          );
          // An ad hoc column is the query's own: the catalog has nothing on it.
          if (column.adhoc) {
            return (
              <li key={column.name} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                {summary}
              </li>
            );
          }
          // A dataset metric has no model; a model's field is keyed by `model.field`.
          const doc = docs?.[column.modelId ? `${column.modelId}.${column.fieldName}` : column.fieldName];
          return (
            <FieldItem key={column.name} column={column} doc={doc} known={!!docs}>
              {summary}
            </FieldItem>
          );
        })}
      </ul>
    </Section>
  );
}

/** A metric's or dimension's row: one line until opened, then what the catalog states of it. */
function FieldItem({
  column,
  doc,
  known,
  children,
}: {
  column: ColumnMeta;
  doc: MetricDoc | undefined;
  /** Whether the host provided the catalog at all; without it nothing is known, not nothing declared. */
  known: boolean;
  children: ReactNode;
}) {
  const none = <span className="text-muted-foreground">{known ? 'None declared.' : 'Not available.'}</span>;
  const [codeTab, setCodeTab] = useState<'aql'>('aql');
  return (
    <Collapsible asChild>
      <li className="group/metric">
        <CollapsibleTrigger className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50">
          {children}
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/metric:rotate-90" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 px-3 pt-1 pb-3">
          <Fields className="text-xs">
            <Field label="Label">{doc?.label || column.label || none}</Field>
            <Field label="Description">{doc?.description || none}</Field>
            <Field label="Type">{doc?.type || column.semantic_type || none}</Field>
            <Field label="Format">
              {doc?.format ? <code className="font-mono">{doc.format}</code> : none}
            </Field>
          </Fields>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Definition</div>
            <CodeBlock
              tab={codeTab}
              onTab={setCodeTab}
              sources={{
                aql: {
                  label: 'AQL',
                  code: doc?.definition && dedent(doc.definition).trim(),
                  lang: 'aql',
                  empty: known ? 'None declared.' : 'Not available.',
                },
              }}
            />
          </div>
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}
