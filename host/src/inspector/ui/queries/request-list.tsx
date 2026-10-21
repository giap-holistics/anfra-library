import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatTime } from '../../model/format';
import type { RequestEntry } from '../../model/requests';
import { CodeBlock } from '../shared/code-block';
import { Field, Fields } from '../shared/fields';
import { ResultTable } from '../shared/result-table';
import { stateDot } from '../shared/tone';

/** How many of a query's requests show before "Show all". */
const FIRST = 5;

/** A request's dot, colored as the query state it amounts to. */
const statusColor: Record<RequestEntry['status'], string | undefined> = {
  ok: stateDot.success,
  error: stateDot.error,
  pending: stateDot.executing,
  aborted: stateDot.idle,
};

/** Requests, newest first: one line each, opened to their input and first rows. */
export function RequestList({
  items,
  cards,
}: {
  items: { entry: RequestEntry; shared?: boolean }[];
  /** Draw each request as a card like a query or control row, for requests listed on their own. */
  cards?: boolean;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, FIRST);
  return (
    <div>
      <ul className={cards ? 'space-y-2' : 'divide-y rounded-lg border bg-background'}>
        {shown.map(({ entry, shared }) =>
          cards ? (
            <RequestCard key={entry.id} entry={entry} />
          ) : (
            <RequestItem key={entry.id} entry={entry} shared={shared} />
          ),
        )}
      </ul>
      {items.length > FIRST && (
        <Button variant="link" size="xs" onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </Button>
      )}
    </div>
  );
}

const callLabels: Record<string, string> = {
  'core.submitQuery': 'Query',
  'export.query': 'Export',
  'core.fieldSuggestions': 'Suggestions',
  'lineage.trace': 'Lineage',
  'render.save': 'Picture saved',
  'anfra.body': 'Plugin code',
};

/** What a request is, in words: its call's label, or the call's name for one this list doesn't know. */
const labelOf = (entry: RequestEntry) => callLabels[entry.call] ?? entry.call;

/** A request's title: the field it suggests for, the dataset it queries, or what it is. */
function titleOf(entry: RequestEntry): string {
  if (entry.call === 'core.fieldSuggestions' && entry.field) return entry.field;
  return entry.dataset || labelOf(entry);
}

/** A request as a card, laid out like a query row: what it is, how it ended, then its details. */
function RequestCard({ entry }: { entry: RequestEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={cn('rounded-md border', open ? 'bg-muted/50' : 'bg-card')}>
      {/* The same shell as a query row: one clickable line, the state as a dot, a chevron at the end. */}
      <div className="group flex h-10 items-center gap-2.5 rounded-md pr-2 hover:bg-accent">
        <button
          type="button"
          className="flex h-full min-w-0 flex-1 items-center gap-2.5 pl-3 text-left text-sm"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <span className="min-w-0 truncate font-medium">{titleOf(entry)}</span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">{summaryOf(entry)}</span>
          <span className="flex-1" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                role="img"
                aria-label={`Status: ${entry.status}`}
                className={cn('size-2 shrink-0 rounded-full', statusColor[entry.status])}
              />
            </TooltipTrigger>
            <TooltipContent>{entry.status}</TooltipContent>
          </Tooltip>
        </button>
        <Button variant="ghost" size="icon-xs" tabIndex={-1} aria-hidden onClick={() => setOpen(!open)}>
          <ChevronRight className={cn('transition-transform', open && 'rotate-90')} />
        </Button>
      </div>
      {entry.error && (
        <p className="px-3 pb-1.5 text-xs break-words text-destructive" role="alert">
          {entry.error}
        </p>
      )}
      {open && (
        <div className="space-y-3 px-3 pt-1.5 pb-3">
          <Fields>
            <Field label="Type">{labelOf(entry)}</Field>
            <Field label="Call">{entry.call}</Field>
            {entry.dataset && <Field label="Dataset">{entry.dataset}</Field>}
            <Field label="Caller">{entry.caller}</Field>
            {entry.trace && <Field label="Middleware">{entry.trace.join(' → ')}</Field>}
            <Field label="Sent at">{formatTime(entry.at)}</Field>
            <Field label="Duration">
              {entry.durationMs === undefined ? 'Still running' : `${entry.durationMs} ms`}
            </Field>
          </Fields>
          {entry.preview && entry.columns && (
            <ResultTable columns={entry.columns} rows={entry.preview} total={entry.numRows} />
          )}
          <CodeBlock
            tab="input"
            onTab={() => {}}
            sources={{ input: { label: 'Input', code: inputOf(entry), lang: 'js', empty: 'No input.' } }}
          />
        </div>
      )}
    </li>
  );
}

/** A request as a row of the same table style as a query's metrics, opened to its input and first rows. */
function RequestItem({ entry, shared }: { entry: RequestEntry; shared?: boolean }) {
  return (
    <Collapsible asChild>
      <li className="group/request text-xs">
        <CollapsibleTrigger className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-accent">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/request:rotate-90" />
          <span className={cn('size-2 shrink-0 rounded-full', statusColor[entry.status])} />
          <span className="shrink-0 font-medium tabular-nums">{formatTime(entry.at)}</span>
          <span className="min-w-0 truncate text-muted-foreground">{summaryOf(entry)}</span>
          {shared && <span className="shrink-0 text-muted-foreground">shared</span>}
          <span className="ml-auto shrink-0 pl-2 text-muted-foreground tabular-nums">
            {entry.durationMs === undefined ? '…' : `${entry.durationMs} ms`}
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2.5 border-t bg-muted/30 px-3 py-2.5">
          {entry.error && <p className="text-xs break-words text-destructive">{entry.error}</p>}
          {entry.preview && entry.columns && (
            <ResultTable columns={entry.columns} rows={entry.preview} total={entry.numRows} />
          )}
          <CodeBlock
            tab="input"
            onTab={() => {}}
            sources={{ input: { label: 'Input', code: inputOf(entry), lang: 'js', empty: 'No input.' } }}
          />
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}

/** What a line says after its time: the source, the page, and the rows or how it ended. */
function summaryOf(entry: RequestEntry): string {
  if (entry.call === 'core.fieldSuggestions') {
    return `suggestions for ${entry.field}${entry.q ? ` "${entry.q}"` : ''}${entry.numRows === undefined ? '' : ` · ${entry.numRows}`}`;
  }
  if (entry.call === 'export.query') {
    const parts = [`export${entry.format ? ` ${entry.format}` : ''}`];
    if (entry.status === 'ok') parts.push(`${entry.numRows ?? 0} rows`);
    else if (entry.status !== 'pending') parts.push(entry.status);
    return parts.join(' · ');
  }
  if (entry.call !== 'core.submitQuery') {
    const parts = [
      entry.targets?.join(', ') ?? entry.filename ?? (entry.caller === 'frame' ? undefined : entry.caller),
    ];
    if (entry.status !== 'ok' && entry.status !== 'pending') parts.push(entry.status);
    return parts.filter(Boolean).join(' · ');
  }
  const parts = [entry.fromCache === undefined ? undefined : entry.fromCache ? 'cache' : 'database'];
  if (entry.page && entry.page > 1) parts.push(`page ${entry.page}`);
  if (entry.status === 'ok') parts.push(`${entry.numRows ?? 0} rows`);
  else if (entry.status !== 'pending') parts.push(entry.status);
  return parts.filter(Boolean).join(' · ');
}

function inputOf(entry: RequestEntry): string | undefined {
  const {
    input,
    page,
    pageSize,
    timezone,
    bustCache,
    dataset,
    aql,
    field,
    q,
    format,
    formatOptions,
    filename,
    targets,
    request,
  } = entry;
  const shown =
    entry.call === 'core.submitQuery'
      ? { dataset, page, pageSize, timezone, bustCache, ...input }
      : entry.call === 'export.query'
        ? { dataset, timezone, format, formatOptions, filename, ...input }
        : entry.call === 'core.fieldSuggestions'
          ? { dataset, field, q }
          : entry.call === 'lineage.trace'
            ? { targets }
            : entry.call === 'render.save'
              ? { filename }
              : isRecord(request)
                ? request
                : { request };
  // Without the declared AQL, which the query shows already, and empty lists.
  const kept = Object.entries(shown).filter(
    ([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0),
  );
  return kept.length ? JSON.stringify(Object.fromEntries(kept), null, 2) : aql;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
