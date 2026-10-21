import type {
  InspectedApp,
  InspectedQuery,
  InspectedStructure,
  StructureNode,
} from '@holistics/anfra-sdk/common';
import { Download, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { blockNodeKey, usageOf } from '../../model/format';
import type { RequestEntry } from '../../model/requests';
import type { RevealTarget } from '../../model/types';
import { AgoTime } from '../shared/ago-time';
import { Note } from '../shared/fields';
import { ResultTable } from '../shared/result-table';

interface Props {
  apps: InspectedApp[] | undefined;
  structure: InspectedStructure | undefined;
  /** Each query's requests, newest first, keyed `<app>/<name>`. */
  requests: Map<string, { entry: RequestEntry }[]>;
  /** Whether the reader may export data; without it there is no download. */
  canExport: boolean;
  onReveal: (target: RevealTarget) => void;
}

/**
 * The tables behind the page, for someone who doesn't write queries: one per query, titled as the
 * page names it, with the rows it last returned. See SPEC.md §4.11.
 */
export function DataTab({ apps, structure, requests, canExport, onReveal }: Props) {
  const [search, setSearch] = useState('');
  const nodes = useMemo(() => nodesByKey(structure?.nodes ?? []), [structure]);
  if (!apps) return <Note>Waiting for the Data App…</Note>;
  if (apps.length === 0) return <Note>This Data App hasn't created an SDK app.</Note>;

  const term = search.trim().toLowerCase();
  const total = apps.reduce((n, app) => n + Object.keys(app.queries).length, 0);
  return (
    <div>
      <div className="sticky top-0 z-10 bg-background px-3 pt-2.5 pb-1">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setSearch('')}
            placeholder="Search tables"
            aria-label="Search tables"
            className="pl-7"
          />
        </div>
      </div>
      <div className="space-y-6 px-3 pt-2 pb-3">
        {total === 0 && <Note>This app has no tables yet.</Note>}
        {apps.map((app, index) => {
          const tables = Object.entries(app.queries)
            .map(([name, query]) => ({ name, query, title: titleOf(structure, nodes, index, name) }))
            .filter(({ title }) => !term || title.toLowerCase().includes(term));
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: an app's index is its identity in the frame
            <section key={index} className="space-y-4">
              {apps.length > 1 && (
                <p className="px-1 text-xs font-medium">
                  App {index + 1} · {app.title || 'Untitled'}
                </p>
              )}
              {tables.length === 0 && term && <Note>No tables match "{search.trim()}".</Note>}
              {tables.map(({ name, query, title }) => (
                <TableCard
                  key={name}
                  title={title}
                  query={query}
                  // The first page's rows: a later page isn't the start of the table.
                  latest={
                    requests
                      .get(`${index}/${name}`)
                      ?.find(
                        (r) =>
                          r.entry.status === 'ok' && r.entry.preview && !(r.entry.page && r.entry.page > 1),
                      )?.entry
                  }
                  canExport={canExport}
                  onTechnical={() => onReveal({ entity: 'query', app: index, name })}
                />
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** Every node in the structure by its key, for looking blocks up once per structure. */
function nodesByKey(nodes: StructureNode[], map = new Map<string, StructureNode>()) {
  for (const node of nodes) {
    map.set(node.key, node);
    nodesByKey(node.children, map);
  }
  return map;
}

/** What the page calls a query: the label of the first block that draws it, else the query's name. */
function titleOf(
  structure: InspectedStructure | undefined,
  nodes: Map<string, StructureNode>,
  app: number,
  name: string,
): string {
  const id = usageOf(structure, 'query', app, name)?.blocks[0];
  const key = id ? blockNodeKey(structure, id, 'query', app, name) : undefined;
  return (key && nodes.get(key)?.label) || name;
}

function TableCard({
  title,
  query,
  latest,
  canExport,
  onTechnical,
}: {
  title: string;
  query: InspectedQuery;
  latest: RequestEntry | undefined;
  canExport: boolean;
  onTechnical: () => void;
}) {
  const labels = Object.fromEntries(query.columns.filter((c) => c.label).map((c) => [c.name, c.label]));
  const rows =
    latest?.preview && latest.columns ? { columns: latest.columns, preview: latest.preview } : undefined;
  // A paged query's first page is only the whole table when no other page follows it.
  const complete = rows && !query.hasMore && query.page <= 1 && (latest?.numRows ?? 0) <= rows.preview.length;
  // When the rows came back, not when they were asked for.
  const returned = latest && new Date(new Date(latest.at).getTime() + (latest.durationMs ?? 0));
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="min-w-0 truncate text-sm font-medium">{title}</h3>
        <span className="shrink-0 text-xs text-muted-foreground">
          {returned && query.state !== 'error' ? <AgoTime at={returned.toISOString()} /> : null}
        </span>
      </div>
      {query.state === 'error' ? (
        // The rows before the error aren't today's answer, so they don't show.
        <p className="text-xs text-muted-foreground">This table couldn't load.</p>
      ) : rows ? (
        <ResultTable columns={rows.columns} rows={rows.preview} total={latest?.numRows} labels={labels} />
      ) : query.state === 'success' ? (
        // Its request has left the log, or the log couldn't tell it from another query's.
        <p className="text-xs text-muted-foreground">This table's rows aren't available here.</p>
      ) : (
        <p className="text-xs text-muted-foreground">Loading this table…</p>
      )}
      <div className="mt-2 flex items-center gap-1">
        {canExport && complete && query.state !== 'error' && rows && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => download(`${title}.csv`, toCsv(rows.columns, rows.preview, labels))}
          >
            <Download />
            Download CSV
          </Button>
        )}
        <Button variant="link" size="xs" className="ml-auto" onClick={onTechnical}>
          Technical details
        </Button>
      </div>
    </div>
  );
}

/** One CSV field: empty for no value, and text a spreadsheet would run as a formula kept as text. */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(columns: string[], rows: unknown[][], labels: Record<string, string>): string {
  const lines = [
    columns.map((c) => csvField(labels[c] || c)),
    ...rows.map((row) => columns.map((_, j) => csvField(row[j]))),
  ];
  // The BOM tells Excel the file is UTF-8; CRLF is the line end CSV readers expect.
  return `﻿${lines.map((line) => line.join(',')).join('\r\n')}`;
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Some browsers only follow a link that is in the page, and start the download after the click.
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
