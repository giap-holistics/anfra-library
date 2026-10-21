import type {
  InspectedApp,
  InspectedControl,
  InspectedQuery,
  InspectedStructure,
  LocateKind,
  LocateTarget,
} from '@holistics/anfra-sdk/common';
import {
  ChevronRight,
  type LucideIcon,
  MousePointerClick,
  Network,
  Search,
  SlidersHorizontal,
  Table2,
} from 'lucide-react';
import { type Dispatch, type ReactNode, type SetStateAction, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn, toggleIn } from '@/lib/utils';
import { isChanged } from '../../model/changes';
import { blockNodeKey, entityKey, usageOf } from '../../model/format';
import { controlTargets, crossFilterTargets, queryInputs } from '../../model/inputs';
import { queryCounts } from '../../model/issues';
import type { attributeRequests } from '../../model/requests';
import type { MetricDocs, QueriesExpansion, QueriesFilter, RevealTarget } from '../../model/types';
import { Note } from '../shared/fields';
import { scrollToAndFlash } from '../shared/reveal';
import { ControlRow } from './control-row';
import { QueryRow } from './query-row';
import { RequestList } from './request-list';
import { SelectionCard } from './selection-card';

interface Props {
  apps: InspectedApp[] | undefined;
  structure: InspectedStructure | undefined;
  /** The request log, split by the query each request belongs to. */
  requests: ReturnType<typeof attributeRequests>;
  /** The search and filter, kept by the panel so other parts of it can set them. */
  view: QueriesFilter;
  onView: (view: QueriesFilter) => void;
  /** Whether the reader may see generated SQL. */
  canViewSql: boolean;
  /** What the catalog says of each metric, for the tooltip beside it. */
  metricDocs: MetricDocs | undefined;
  /** Which rows are open and which sections closed, kept by the panel across tab switches. */
  expansion: QueriesExpansion;
  onExpansion: Dispatch<SetStateAction<QueriesExpansion>>;
  /** An entity to open and scroll to, asked for from elsewhere; the nonce repeats a request. */
  focus: { key: string; nonce: number } | undefined;
  /** Called once `focus` is handled, so the tab mounting again doesn't repeat it. */
  onFocused: () => void;
  onLocate: (target: LocateTarget) => void;
  onReveal: (target: RevealTarget) => void;
}

const matches = (search: string, ...texts: (string | undefined)[]) =>
  !search || texts.some((text) => text?.toLowerCase().includes(search));

function showQuery(view: QueriesFilter, app: InspectedApp, name: string, query: InspectedQuery) {
  if (view.filter === 'errors' && query.state !== 'error') return false;
  if (view.filter === 'dirty' && !query.isDirty) return false;
  return matches(view.search.trim().toLowerCase(), name, app.declaration.queries[name]?.dataset);
}

function showControl(view: QueriesFilter, app: InspectedApp, name: string, control: InspectedControl) {
  // Controls have no error state.
  if (view.filter === 'errors') return false;
  if (view.filter === 'dirty' && !control.isDirty) return false;
  const declaration = app.declaration.filters[name] ?? app.declaration.dateDrills[name];
  const field = declaration && 'field' in declaration ? declaration.field : undefined;
  return matches(view.search.trim().toLowerCase(), name, declaration?.label, field);
}

/**
 * Every app's queries, controls and selection, one line each until opened. Which rows and
 * sections are open is the panel's, so it survives both new snapshots and switching tabs.
 */
export function QueriesTab({
  apps,
  structure,
  requests,
  view,
  onView,
  canViewSql,
  metricDocs,
  expansion,
  onExpansion,
  focus,
  onFocused,
  onLocate,
  onReveal,
}: Props) {
  const { open, closedSections } = expansion;
  const setOpen = (update: (prev: Set<string>) => Set<string>) =>
    onExpansion((prev) => ({ ...prev, open: update(prev.open) }));
  const setClosedSections = (update: (prev: Set<string>) => Set<string>) =>
    onExpansion((prev) => ({ ...prev, closedSections: update(prev.closedSections) }));

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per request, not per snapshot
  useEffect(() => {
    if (!focus) return;
    // Split at the first ':' only: a name may contain one.
    const colon = focus.key.indexOf(':');
    const kind = focus.key.slice(0, colon);
    const rest = focus.key.slice(colon + 1);
    const app = Number(rest.split('/')[0]);
    const name = rest.slice(rest.indexOf('/') + 1);
    // A search or filter that would hide it goes.
    const inspected = apps?.[app];
    const query = inspected?.queries[name];
    const control = inspected?.controls[name];
    const hidden =
      inspected &&
      (kind === 'query'
        ? query && !showQuery(view, inspected, name, query)
        : control && !showControl(view, inspected, name, control));
    if (hidden) onView({ search: '', filter: 'all' });
    setOpen((prev) => new Set(prev).add(focus.key));
    setClosedSections((prev) => {
      const next = new Set(prev);
      next.delete(`${app}:${kind}`);
      return next;
    });
    scrollToAndFlash(`[data-entity="${CSS.escape(focus.key)}"]`);
    onFocused();
  }, [focus]);

  if (!apps) return <Note>Waiting for the Data App…</Note>;
  if (apps.length === 0) return <Note>This Data App hasn't created an SDK app.</Note>;

  const all = queryCounts(apps);
  const counts = { errors: all.error, dirty: all.dirty + all.dirtyControls };
  const filtering = view.search.trim() !== '' || view.filter !== 'all';

  return (
    <div>
      <Toolbar view={view} onView={onView} counts={counts} />
      <div className="space-y-6 px-3 pt-1 pb-3">
        {apps.map((app, index) => {
          const queries = Object.entries(app.queries);
          const controls = Object.entries(app.controls);
          const shownQueries = queries.filter(([name, q]) => showQuery(view, app, name, q));
          const shownControls = controls.filter(([name, c]) => showControl(view, app, name, c));
          const section = (name: string) => ({
            open: !closedSections.has(`${index}:${name}`),
            onToggle: () => setClosedSections((prev) => toggleIn(prev, `${index}:${name}`)),
          });
          const row = (kind: LocateKind, name: string) => {
            const key = entityKey(kind, index, name);
            return {
              entityKey: key,
              open: open.has(key),
              onToggle: () => setOpen((prev) => toggleIn(prev, key)),
              app: index,
              name,
              usage: usageOf(structure, kind, index, name),
              blockKey: (block: string) => blockNodeKey(structure, block, kind, index, name),
              onLocate,
            };
          };
          const none = (what: string) =>
            view.search.trim() ? `No ${what} match "${view.search.trim()}".` : `No ${what} match the filter.`;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: an app's index is its identity in the frame
            <section key={index} className="space-y-5">
              <p className="px-1 text-xs text-muted-foreground">
                {apps.length > 1 && <span className="font-medium text-foreground">App {index + 1} · </span>}
                {app.title || 'Untitled'} · {app.timezone || 'tenant timezone'} ·{' '}
                {app.hasChanges ? (
                  <span className="text-amber-600 dark:text-amber-400">unapplied changes</span>
                ) : (
                  'no unapplied changes'
                )}
              </p>

              <Section
                title="Queries"
                icon={Table2}
                count={queries.length}
                shown={filtering ? shownQueries.length : undefined}
                empty={filtering ? none('queries') : 'None.'}
                {...section('query')}
              >
                {shownQueries.map(([name, query]) => (
                  <QueryRow
                    key={name}
                    query={query}
                    declaration={app.declaration.queries[name]}
                    inputs={queryInputs(app, name)}
                    crossTargets={crossFilterTargets(app, name)}
                    requests={requests.byQuery.get(`${index}/${name}`) ?? []}
                    canViewSql={canViewSql}
                    metricDocs={metricDocs}
                    onReveal={onReveal}
                    {...row('query', name)}
                  />
                ))}
              </Section>

              <Section
                title="Controls"
                icon={SlidersHorizontal}
                count={controls.length}
                shown={filtering ? shownControls.length : undefined}
                empty={
                  view.filter === 'errors'
                    ? 'Controls have no error state.'
                    : filtering
                      ? none('controls')
                      : 'This app declares no controls.'
                }
                {...section('control')}
              >
                {shownControls.map(([name, control]) => (
                  <ControlRow
                    key={name}
                    control={control}
                    declaration={app.declaration.filters[name] ?? app.declaration.dateDrills[name]}
                    targets={controlTargets(app, name)}
                    changed={isChanged(app, name, control)}
                    onReveal={onReveal}
                    {...row('control', name)}
                  />
                ))}
              </Section>

              {(app.selection || app.appliedSelection) && (
                <Section
                  title="Selection"
                  icon={MousePointerClick}
                  count={[app.selection, app.appliedSelection].filter(Boolean).length}
                  empty="None."
                  {...section('selection')}
                >
                  {app.selection && <SelectionCard label="Current" selection={app.selection} />}
                  {app.appliedSelection && <SelectionCard label="Applied" selection={app.appliedSelection} />}
                </Section>
              )}
            </section>
          );
        })}

        {requests.other.length > 0 && (
          <Section
            title="Other requests"
            icon={Network}
            count={requests.other.length}
            empty="None."
            open={!closedSections.has('other')}
            onToggle={() => setClosedSections((prev) => toggleIn(prev, 'other'))}
          >
            <RequestList cards items={requests.other.map((entry) => ({ entry }))} />
          </Section>
        )}
      </div>
    </div>
  );
}

function Toolbar({
  view,
  onView,
  counts,
}: {
  view: QueriesFilter;
  onView: (view: QueriesFilter) => void;
  counts: { errors: number; dirty: number };
}) {
  const filters: { value: QueriesFilter['filter']; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'errors', label: `Errors (${counts.errors})` },
    { value: 'dirty', label: `Dirty (${counts.dirty})` },
  ];
  return (
    <div className="sticky top-0 z-10 flex items-center gap-1.5 bg-background px-3 pt-2.5 pb-1">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={view.search}
          onChange={(event) => onView({ ...view, search: event.target.value })}
          onKeyDown={(event) => event.key === 'Escape' && onView({ ...view, search: '' })}
          placeholder="Search names, datasets, labels"
          aria-label="Search queries and controls"
          className="pl-7"
        />
      </div>
      <ToggleGroup
        className="shadow-xs"
        type="single"
        variant="outline"
        size="default"
        value={view.filter}
        // Clicking the pressed item clears a single group; a filter is always one of the three.
        onValueChange={(value) => value && onView({ ...view, filter: value as QueriesFilter['filter'] })}
      >
        {filters.map((filter) => (
          <ToggleGroupItem
            key={filter.value}
            value={filter.value}
            className="dark:bg-input/30 dark:data-[state=on]:bg-accent"
          >
            {filter.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function Section(props: {
  title: string;
  icon: LucideIcon;
  count: number;
  /** How many show, when a search or filter hides some. */
  shown?: number;
  empty: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const visible = props.shown ?? props.count;
  return (
    <Collapsible open={props.open} onOpenChange={props.onToggle}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start">
          <props.icon />
          {props.title}
          <span className="font-normal text-muted-foreground">
            {props.shown === undefined ? props.count : `${props.shown} of ${props.count}`}
          </span>
          <ChevronRight className={cn('ml-auto transition-transform', props.open && 'rotate-90')} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className={cn('space-y-2', visible === 0 ? 'mt-3' : 'mt-2')}>
        {visible === 0 ? <Note>{props.empty}</Note> : props.children}
      </CollapsibleContent>
    </Collapsible>
  );
}
