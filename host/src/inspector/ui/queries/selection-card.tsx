import type { InspectedSelection } from '@holistics/anfra-sdk/common';
import { formatCondition } from '../../model/format';
import { Field, Fields } from '../shared/fields';

export function SelectionCard({ label, selection }: { label: string; selection: InspectedSelection }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <p className="text-sm font-medium">
        {label}
        {selection.lossy && (
          <span className="ml-1.5 text-xs font-normal text-amber-600 dark:text-amber-400">lossy</span>
        )}
      </p>
      {selection.lossy && (
        <p className="mb-1 text-xs text-amber-700 dark:text-amber-300">
          Some selected values can't be expressed as a filter, so the queries it filters see less than was
          selected.
        </p>
      )}
      <Fields>
        <Field label="From">{selection.source}</Field>
        <Field label="Rows">{selection.rowCount}</Field>
        {selection.expression && (
          <Field label="Expression">
            <code className="font-sans break-all">{selection.expression}</code>
          </Field>
        )}
        {selection.conditions.map((condition, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no identity of their own
          <Field key={i} label={condition.field}>
            {formatCondition(condition)}
          </Field>
        ))}
      </Fields>
    </div>
  );
}
