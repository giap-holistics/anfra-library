import type { StructureNode } from '@holistics/anfra-sdk/common';
import { Cable, Database, GitFork, LayoutDashboard, ListTree, Sheet } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TooltipProvider } from '@/components/ui/tooltip';
import { wiringChecks } from '../model/checks';
import { countProblems, entityKey, firstEntityUnder, keysUnder } from '../model/format';
import { queryCounts } from '../model/issues';
import { buildReport } from '../model/report';
import { attributeRequests } from '../model/requests';
import { appTrust } from '../model/trust';
import type {
  InspectorTab,
  NodeRequest,
  QueriesExpansion,
  QueriesFilter,
  RevealTarget,
} from '../model/types';
import type { InspectorSource } from '../source';
import { DataTab } from './data/data-tab';
import { InspectorHeader } from './header';
import { type LineageFetch, type LineagePick, LineageTab, type LineageView } from './lineage/lineage-tab';
import { OverviewTab } from './overview/overview-tab';
import { QueriesTab } from './queries/queries-tab';
import { Note } from './shared/fields';
import { StructureTree } from './structure/structure-tree';
import { WiringTab } from './wiring/wiring-tab';

interface Props {
  /** The mounted frame to inspect. */
  source: InspectorSource;
  tab: InspectorTab;
  onTab: (tab: InspectorTab) => void;
  /**
   * The node picked on the page, to select and reveal in the tree; a new nonce repeats a pick of
   * the same node. The host owns pick mode; the header's Pick button toggles it.
   */
  picked: NodeRequest | undefined;
  picking: boolean;
  onTogglePicking: () => void;
  onClose: () => void;
}

/**
 * A devtool over the running Data App: its health at a glance, the page's parts as its markup
 * declares them, and every app's queries, controls and selection. See SPEC.md.
 */
/** The structure key of the query a name and app point at, if the page draws it. */
function queryKeyOf(nodes: StructureNode[], app: number, name: string): string | undefined {
  for (const n of nodes) {
    if (n.kind === 'query' && (n.app ?? 0) === app && n.name === name) return n.key;
    const found = queryKeyOf(n.children, app, name);
    if (found) return found;
  }
  return undefined;
}

export function Inspector({ source, tab, onTab, picked, picking, onTogglePicking, onClose }: Props) {
  const snapshot = useSyncExternalStore(source.subscribe, source.getSnapshot);
  const apps = snapshot?.apps;
  const structure = snapshot?.structure;
  const requests = useSyncExternalStore(source.requests.subscribe, source.requests.entries);
  const attributed = useMemo(() => attributeRequests(requests, apps ?? []), [requests, apps]);
  const problems = structure ? countProblems(structure.nodes) : 0;
  const counts = apps && queryCounts(apps);
  const trust = apps?.length
    ? apps.map(appTrust).reduce((lowest, t) => (t.level < lowest.level ? t : lowest))
    : undefined;
  const checks = useMemo(() => (apps ?? []).map(wiringChecks), [apps]);
  const warnings = checks.flat().filter((c) => c.level !== 'info').length;

  // An entity to open in Queries, or a node to select in Structure; the nonce repeats a request.
  const [focus, setFocus] = useState<{ key: string; nonce: number }>();
  const [node, setNode] = useState<NodeRequest>();
  const [check, setCheck] = useState<{ app: number; check: number; nonce: number }>();
  const [view, setView] = useState<QueriesFilter>({ search: '', filter: 'all' });
  const [expansion, setExpansion] = useState<QueriesExpansion>({
    open: new Set(),
    closedSections: new Set(),
  });
  const [lineageView, setLineageView] = useState<LineageView>({ hidden: new Set(), crossFilters: false });
  const [lineage, setLineage] = useState<LineageFetch>();
  const [lineagePick, setLineagePick] = useState<LineagePick>();

  const handledPick = useRef(picked?.nonce);

  const reveal = (target: RevealTarget) => {
    if ('tab' in target) {
      if (target.filter) setView({ search: '', filter: target.filter });
      onTab(target.tab);
    } else if ('entity' in target) {
      setFocus({ key: entityKey(target.entity, target.app, target.name), nonce: Date.now() });
      onTab('queries');
    } else if ('lineage' in target) {
      const key = queryKeyOf(structure?.nodes ?? [], target.app, target.name);
      if (key && structure) {
        setLineagePick({ keys: keysUnder(structure.nodes, key), nonce: Date.now() });
      }
      onTab('lineage');
    } else if ('check' in target) {
      setCheck({ ...target, nonce: Date.now() });
      onTab('wiring');
    } else {
      setNode({ key: target.node, nonce: Date.now() });
      onTab('structure');
    }
  };

  // A pick lands on its node in Structure; with Shift, or from the Queries tab, on the first query or
  // control in it, in Queries; from the Lineage tab, on the first of its nodes the canvas draws.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per pick, not per snapshot
  useEffect(() => {
    if (!picked) return setNode(undefined);
    // A pick already handled before this mount (the panel was closed and reopened) isn't a new one.
    if (picked.nonce === handledPick.current) return;
    handledPick.current = picked.nonce;
    if (tab === 'lineage' && !picked.inData && structure) {
      setLineagePick({ keys: keysUnder(structure.nodes, picked.key), nonce: picked.nonce });
      return;
    }
    const toData = picked.inData || tab === 'queries';
    const entity = toData && structure ? firstEntityUnder(structure.nodes, picked.key) : undefined;
    if (entity) reveal(entity);
    else {
      setNode(picked);
      onTab('structure');
    }
  }, [picked]);

  const title =
    !apps || apps.length === 0
      ? (source.env.path ?? 'Inspect')
      : apps.length === 1
        ? apps[0]?.title || source.env.path || 'Untitled'
        : `${apps.length} apps`;

  return (
    <TooltipProvider delayDuration={300}>
      <Tabs
        value={tab}
        onValueChange={(value) => onTab(value as InspectorTab)}
        className="h-full gap-0 border-l"
      >
        <InspectorHeader
          title={title}
          counts={counts}
          trust={trust}
          picking={picking}
          onTogglePicking={onTogglePicking}
          onShowQueries={(filter) => {
            setView({ search: '', filter });
            onTab('queries');
          }}
          report={() => JSON.stringify(buildReport(snapshot, source.env, requests), null, 2)}
          onClose={onClose}
        />
        {/* The active tab's underline hangs a pixel below the list; room for it keeps a vertical scrollbar away. */}
        <div className="shrink-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-b px-2 pt-1.5 pb-px">
          <TabsList variant="line">
            <TabsTrigger value="overview">
              <LayoutDashboard />
              Overview
            </TabsTrigger>
            <TabsTrigger value="data">
              <Sheet />
              Data
            </TabsTrigger>
            <TabsTrigger value="structure">
              <ListTree />
              Structure
              <Count n={problems} />
            </TabsTrigger>
            <TabsTrigger value="queries">
              <Database />
              Queries
              <Count n={counts?.error ?? 0} />
            </TabsTrigger>
            <TabsTrigger value="lineage">
              <GitFork />
              Lineage
            </TabsTrigger>
            <TabsTrigger value="wiring">
              <Cable />
              Wiring
              <Count n={warnings} />
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="min-h-0">
          <div className="h-full overflow-y-auto">
            <OverviewTab
              snapshot={snapshot}
              env={source.env}
              requests={requests}
              checks={checks}
              onReveal={reveal}
              onLocate={source.locate}
            />
          </div>
        </TabsContent>

        <TabsContent value="data" className="min-h-0">
          <div className="h-full overflow-y-auto">
            <DataTab
              apps={apps}
              structure={structure}
              requests={attributed.byQuery}
              canExport={source.env.reader.permissions.canExportData}
              onReveal={reveal}
            />
          </div>
        </TabsContent>

        <TabsContent value="structure" className="min-h-0">
          <div className="h-full overflow-y-auto">
            <div className="p-2">
              {!structure && <Note>Waiting for the Data App…</Note>}
              {structure?.nodes.length === 0 && (
                <Note>
                  Nothing is marked yet. Add <code className="font-sans">data-anfra-container</code>,{' '}
                  <code className="font-sans">data-anfra-block</code>,{' '}
                  <code className="font-sans">data-anfra-query</code> and{' '}
                  <code className="font-sans">data-anfra-control</code> to the page's elements and they show
                  up here.
                </Note>
              )}
              {structure && structure.nodes.length > 0 && (
                <StructureTree
                  structure={structure}
                  picked={node}
                  onPicked={() => setNode(undefined)}
                  onHighlight={source.highlight}
                  onLocate={(key) => source.locate({ node: key })}
                  onDownload={source.download}
                  onShowInLineage={(n) => {
                    if (!structure) return;
                    setLineagePick({ keys: keysUnder(structure.nodes, n.key), nonce: Date.now() });
                    onTab('lineage');
                  }}
                  onShowInData={(n) => {
                    if (n.kind === 'query' || n.kind === 'control') {
                      reveal({ entity: n.kind, app: n.app ?? 0, name: n.name ?? '' });
                    }
                  }}
                />
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="queries" className="min-h-0">
          <div className="h-full overflow-y-auto">
            <QueriesTab
              apps={apps}
              structure={structure}
              requests={attributed}
              view={view}
              onView={setView}
              canViewSql={source.env.reader.permissions.canViewGeneratedSql}
              metricDocs={source.env.metricDocs}
              expansion={expansion}
              onExpansion={setExpansion}
              focus={focus}
              onFocused={() => setFocus(undefined)}
              onLocate={source.locate}
              onReveal={reveal}
            />
          </div>
        </TabsContent>

        <TabsContent value="lineage" className="min-h-0">
          <LineageTab
            apps={apps}
            structure={structure}
            env={source.env}
            view={lineageView}
            onView={setLineageView}
            fetched={lineage}
            onFetched={setLineage}
            onLocate={source.locate}
            onHighlight={source.highlight}
            onReveal={reveal}
            pick={lineagePick}
          />
        </TabsContent>

        <TabsContent value="wiring" className="min-h-0">
          <div className="h-full overflow-y-auto">
            <WiringTab
              apps={apps}
              checks={checks}
              focus={check}
              onFocused={() => setCheck(undefined)}
              onReveal={reveal}
            />
          </div>
        </TabsContent>
      </Tabs>
    </TooltipProvider>
  );
}

/** An issue count on a tab; nothing when there are none. */
function Count({ n }: { n: number }) {
  if (n === 0) return null;
  return <Badge variant="destructive">{n}</Badge>;
}
