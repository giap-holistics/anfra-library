import type { InspectedApp } from '@holistics/anfra-sdk/common';
import { CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Item, ItemContent, ItemMedia } from '@/components/ui/item';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { type Check, type CheckLevel, controlMappings, crossFilters } from '../../model/checks';
import { declarationCode } from '../../model/declaration-code';
import type { RevealTarget } from '../../model/types';
import { CodeBlock } from '../shared/code-block';
import { EntityLink } from '../shared/entity-link';
import { Note, SectionTitle } from '../shared/fields';
import { scrollToAndFlash } from '../shared/reveal';

interface Props {
  apps: InspectedApp[] | undefined;
  /** Each app's wiring checks, by index. */
  checks: Check[][];
  /** A check to scroll to, asked for from elsewhere in the panel; the nonce repeats a request. */
  focus: { app: number; check: number; nonce: number } | undefined;
  /** Called once `focus` is handled, so the tab mounting again doesn't repeat it. */
  onFocused: () => void;
  onReveal: (target: RevealTarget) => void;
}

/** How every app is put together, from its declaration. See SPEC.md §4.6. */
export function WiringTab({ apps, checks, focus, onFocused, onReveal }: Props) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per request, not per render
  useEffect(() => {
    if (!focus) return;
    scrollToAndFlash(`[data-check="${focus.app}:${focus.check}"]`);
    onFocused();
  }, [focus]);

  if (!apps) return <Note>Waiting for the Data App…</Note>;
  if (apps.length === 0) return <Note>This Data App hasn't created an SDK app.</Note>;

  return (
    <div className="space-y-6 p-2">
      {apps.map((app, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: an app's index is its identity in the frame
        <section key={index} className="space-y-4">
          {apps.length > 1 && (
            <p className="px-1 text-sm font-medium">
              App {index + 1} · {app.title || 'Untitled'}
            </p>
          )}
          <Counts app={app} />
          <Matrix app={app} index={index} onReveal={onReveal} />
          <Checks checks={checks[index] ?? []} index={index} onReveal={onReveal} />
          <Declaration app={app} />
        </section>
      ))}
    </div>
  );
}

function Counts({ app }: { app: InspectedApp }) {
  const { queries, filters, dateDrills } = app.declaration;
  const counts = [
    [Object.keys(queries).length, 'queries'],
    [Object.keys(filters).length + Object.keys(dateDrills).length, 'controls'],
    [controlMappings(app).length, 'mappings'],
    [crossFilters(app).length, 'cross-filters'],
  ] as const;
  return (
    <div className="flex flex-wrap gap-1 px-1">
      {counts.map(([n, label]) => (
        <Badge key={label} variant="outline">
          {n} {label}
        </Badge>
      ))}
    </div>
  );
}

/** Queries down, controls across: which control filters which query, and on what. */
function Matrix({
  app,
  index,
  onReveal,
}: {
  app: InspectedApp;
  index: number;
  onReveal: (target: RevealTarget) => void;
}) {
  const queries = Object.keys(app.declaration.queries);
  const controls = [...Object.keys(app.declaration.filters), ...Object.keys(app.declaration.dateDrills)];
  const mappings = controlMappings(app);
  const crosses = crossFilters(app);
  if (queries.length === 0) return null;

  const link = (entity: 'query' | 'control', name: string) => (
    <EntityLink entity={entity} app={index} name={name} onReveal={onReveal} />
  );

  return (
    <div>
      <SectionTitle hint="Which controls and cross-filters feed which queries, as declared by the app.">
        Wiring
      </SectionTitle>
      <div className="mt-1 rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>query</TableHead>
              {controls.map((name) => (
                <TableHead key={name}>{link('control', name)}</TableHead>
              ))}
              <TableHead>cross-filtered by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queries.map((query) => {
              const by = crosses.filter((c) => c.to.name === query).map((c) => c.from.name);
              return (
                <TableRow key={query}>
                  <TableCell>{link('query', query)}</TableCell>
                  {controls.map((control) => {
                    const m = mappings.find((x) => x.from.name === control && x.to.name === query);
                    return (
                      <TableCell key={control} className="text-center">
                        {m ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default">●</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {m.field}
                              {m.aggregation && ` (${m.aggregation})`}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground/50">·</span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-muted-foreground">{by.length ? by.join(', ') : '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

const checkIcon: Record<CheckLevel, ReactNode> = {
  error: <CircleAlert className="mt-px size-3.5 shrink-0 text-destructive" aria-label="error" />,
  warn: <TriangleAlert className="mt-px size-3.5 shrink-0 text-amber-500" aria-label="warning" />,
  info: <Info className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-label="info" />,
};

function Checks({
  checks,
  index,
  onReveal,
}: {
  checks: Check[];
  index: number;
  onReveal: (target: RevealTarget) => void;
}) {
  return (
    <div>
      <SectionTitle hint="Static checks on the declaration for mistakes the SDK reports late or never, such as cross-filters across datasets or controls mapped to no query. Click a row to jump to it.">
        Checks
      </SectionTitle>
      {checks.length === 0 ? (
        <div className="mt-1.5">
          <Note>No issues found.</Note>
        </div>
      ) : (
        <ul className="mt-1 space-y-px">
          {checks.map((check, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a check's index is how the panel links to it
            <li key={i} data-check={`${index}:${i}`}>
              <Item
                asChild
                size="sm"
                className={cn(
                  'w-full cursor-pointer text-left hover:bg-accent',
                  check.level === 'info' && 'text-muted-foreground',
                )}
              >
                <button
                  type="button"
                  onClick={() => onReveal({ entity: check.about.entity, app: index, name: check.about.name })}
                >
                  <ItemMedia variant="default">{checkIcon[check.level]}</ItemMedia>
                  <ItemContent className="break-words">{check.message}</ItemContent>
                </button>
              </Item>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Declaration({ app }: { app: InspectedApp }) {
  const code = declarationCode(app);
  return (
    <div>
      <SectionTitle hint="The app's queries, controls and mappings, as code reconstructed from what the Data App declared.">
        Declaration
      </SectionTitle>
      <div className="mt-1">
        <CodeBlock
          tab="js"
          onTab={() => {}}
          className="max-h-96"
          sources={{ js: { label: 'JS', code: code || undefined, lang: 'js', empty: 'Nothing declared.' } }}
        />
      </div>
    </div>
  );
}
