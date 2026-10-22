import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { plural } from '../../model/format';

/**
 * The first rows of a result, as a table that scrolls both ways within its box. `labels` swaps a
 * column's header for a friendlier one, by the column's key.
 */
export function ResultTable({
  columns,
  rows,
  total,
  labels,
}: {
  columns: string[];
  rows: unknown[][];
  total?: number;
  labels?: Record<string, string>;
}) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">
        {rows.length === 0
          ? 'No rows.'
          : total !== undefined && total > rows.length
            ? `First ${rows.length} of ${total} rows`
            : plural(rows.length, 'row')}
      </p>
      {rows.length > 0 && (
        // The table scrolls within its own container, so the cap goes there for the header to stick.
        <div className="overflow-hidden rounded-md border [&_[data-slot=table-container]]:max-h-60 [&_[data-slot=table-container]]:overflow-auto">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 bg-muted">
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column} className="h-7 px-2 text-xs font-semibold">
                    {labels?.[column] ?? column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
                <TableRow key={i}>
                  {columns.map((column, j) => (
                    <TableCell key={column} className="max-w-48 truncate px-2 py-1">
                      {cell(row[j])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function cell(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
