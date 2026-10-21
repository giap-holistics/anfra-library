import type { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';

/** A small headerless table inside an opened row, with a caption; it scrolls sideways within its box. */
export function MiniTable({
  caption,
  rows,
}: {
  caption?: ReactNode;
  rows: { key: string; cells: ReactNode[] }[];
}) {
  return (
    <div>
      {caption && <div className="mb-0.5 px-1 text-xs text-muted-foreground">{caption}</div>}
      <div className="rounded-lg border bg-background">
        <Table className="text-xs leading-5">
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.key}>
                {row.cells.map((cell, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional
                  <TableCell key={i} className="px-3 py-2 align-top">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
