import type {
  ConditionValue,
  DateDrillDeclaration,
  FilterDeclaration,
  InspectedControl,
} from '@holistics/anfra-sdk/common';
import { ArrowRight, Table2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatCondition } from '../../model/format';
import type { controlTargets } from '../../model/inputs';
import type { RevealTarget } from '../../model/types';
import { Field, Fields } from '../shared/fields';
import { Drawn, EntityRow, Expandable, IconButton, type RowProps } from './entity-row';

export function ControlRow({
  control,
  declaration,
  targets,
  changed,
  onReveal,
  ...props
}: RowProps & {
  control: InspectedControl;
  declaration: FilterDeclaration | DateDrillDeclaration | undefined;
  /** The queries it is mapped to. */
  targets: ReturnType<typeof controlTargets>;
  /** Whether its condition differs from the declared default. */
  changed: boolean;
  onReveal: (target: RevealTarget) => void;
}) {
  const summary = (
    <>
      <span className="shrink-0 font-medium">{props.name}</span>
      <span className="truncate text-xs text-muted-foreground">
        {control.condition.values?.length ? formatCondition(control.condition) : ''}
      </span>
      {control.isDirty && (
        <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">unapplied</span>
      )}
      <span className="flex-1" />
      {changed && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="img"
              aria-label="Changed from the default"
              className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-orange-500/15 text-[10px] leading-none font-semibold text-orange-600 dark:text-orange-400"
            >
              M
            </span>
          </TooltipTrigger>
          <TooltipContent>Changed from the default value</TooltipContent>
        </Tooltip>
      )}
      <TargetCount verb="Applies to" app={props.app} targets={targets} onReveal={onReveal} />
    </>
  );
  const filter = declaration && 'field' in declaration ? declaration : undefined;
  const fallback = declaration?.default;
  const fixed = filter?.options;
  const options = fixed ?? control.options;

  return (
    <EntityRow kind="control" summary={summary} {...props}>
      <Fields>
        <Field label="Kind">
          {control.kind === 'dateDrill' ? 'Date drill' : 'Filter'}
          {filter?.field && <span className="text-muted-foreground"> on {filter.field}</span>}
          {filter?.type && <span className="text-muted-foreground"> · {filter.type}</span>}
        </Field>
        {declaration?.label && <Field label="Label">{declaration.label}</Field>}
        <Field label="Set to">{formatCondition(control.condition)}</Field>
        <Field label="Applied">{formatCondition(control.appliedCondition)}</Field>
        {fallback && (
          <Field label="Default">{typeof fallback === 'string' ? fallback : formatCondition(fallback)}</Field>
        )}
        {options ? (
          <Field label="Options">
            <Options
              options={options}
              source={fixed ? 'fixed' : 'loaded'}
              selected={control.condition.values?.map(String) ?? []}
            />
          </Field>
        ) : (
          control.kind === 'filter' && (
            <Field label="Options">
              <span className="text-muted-foreground">Not loaded</span>
            </Field>
          )
        )}
        <Field label="Maps to">
          <MapsTo app={props.app} targets={targets} onReveal={onReveal} />
        </Field>
        <Field label="On the page">
          <Drawn
            kind="control"
            app={props.app}
            name={props.name}
            usage={props.usage}
            blockKey={props.blockKey}
            onReveal={onReveal}
            onLocate={props.onLocate}
          />
        </Field>
      </Fields>
    </EntityRow>
  );
}

/** The queries a control maps to: a count that opens into one row per query, each with the field and a button to open it. */
export function MapsTo({
  app,
  targets,
  onReveal,
  empty = <span className="text-amber-600 dark:text-amber-400">No query, so it has no effect</span>,
}: {
  app: number;
  targets: { query: string; field?: string; self?: boolean }[];
  onReveal: (target: RevealTarget) => void;
  /** What stands in when there are no targets. */
  empty?: ReactNode;
}) {
  if (targets.length === 0) return empty;
  return (
    <Expandable label={targets.length === 1 ? '1 query' : `${targets.length} queries`}>
      <ul className="space-y-0.5 pl-1">
        {targets.map((target) => (
          <li key={targetKey(target)} className="flex items-center gap-1 rounded-md pl-2 hover:bg-accent">
            <span className="min-w-0 flex-1 truncate">
              {target.query}
              {target.field && <span className="text-muted-foreground"> on {target.field}</span>}
              {target.self && <span className="text-muted-foreground"> (itself)</span>}
            </span>
            <IconButton
              label="Show query"
              onClick={() => onReveal({ entity: 'query', app, name: target.query })}
            >
              <ArrowRight />
            </IconButton>
          </li>
        ))}
      </ul>
    </Expandable>
  );
}

/** A query can be reached more than once (a control mapped on two of its fields), so the field is part of the key. */
function targetKey(target: { query: string; field?: string }) {
  return target.field ? `${target.query}/${target.field}` : target.query;
}

/** A filter's choices: a count that opens into one chip per option, the ones currently picked marked. */
function Options({
  options,
  source,
  selected,
}: {
  options: ConditionValue[];
  source: 'fixed' | 'loaded';
  selected: string[];
}) {
  return (
    <Expandable label={`${options.length} ${source}`}>
      <ul className="flex flex-wrap gap-1 pl-1">
        {options.map((option) => (
          <li
            key={String(option)}
            className={cn(
              'max-w-full truncate rounded-md border px-1.5 py-0.5 text-xs',
              selected.includes(String(option))
                ? 'border-primary/40 bg-accent font-medium'
                : 'text-muted-foreground',
            )}
          >
            {String(option)}
          </li>
        ))}
      </ul>
    </Expandable>
  );
}

/** What a tooltip says of the queries an entity reaches: a heading and one link per query. */
function TargetsTip({
  verb,
  app,
  targets,
  onReveal,
}: {
  verb: string;
  app: number;
  targets: { query: string; field?: string; self?: boolean }[];
  onReveal: (target: RevealTarget) => void;
}) {
  if (targets.length === 0) return <>{verb} no query</>;
  return (
    <div className="space-y-0.5">
      <div>
        {verb} {targets.length === 1 ? '1 query' : `${targets.length} queries`}
      </div>
      <ul>
        {targets.map((target) => (
          <li key={targetKey(target)}>
            <button
              type="button"
              className="text-left hover:underline"
              onClick={(event) => {
                // The tooltip is portaled, but React still bubbles the click to the row it wraps.
                event.stopPropagation();
                onReveal({ entity: 'query', app, name: target.query });
              }}
            >
              {target.query}
              {target.field && <span className="opacity-70"> on {target.field}</span>}
              {target.self && <span className="opacity-70"> (itself)</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Wraps whatever it is given (one element) so that hovering it lists the queries the entity reaches. */
export function TargetsTooltip({
  children,
  side = 'bottom',
  ...tip
}: React.ComponentProps<typeof TargetsTip> & {
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        <TargetsTip {...tip} />
      </TooltipContent>
    </Tooltip>
  );
}

/** A row's count of the queries it reaches, with a tooltip listing them. */
export function TargetCount({
  targets,
  ...tip
}: React.ComponentProps<typeof TargetsTip> & {
  targets: { query: string; field?: string; self?: boolean }[];
}) {
  return (
    <TargetsTooltip side="left" targets={targets} {...tip}>
      <span className="flex w-9 shrink-0 items-center justify-end gap-1 text-xs text-muted-foreground tabular-nums">
        {targets.length}
        <Table2 className="size-3.5 shrink-0" />
      </span>
    </TargetsTooltip>
  );
}
