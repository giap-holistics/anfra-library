import { RotateCw, ScanSearch } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type AnchorRect, buildCommentPrompt, CommentCard, findNode } from '@/comments';
import { AppInfo } from '@/components/app-info';
import { CommandPalette } from '@/components/command-palette';
import { DataAppStage, type StageHandle } from '@/components/data-app-stage';
import { PromptPanel } from '@/components/prompt-panel';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { VersionsPanel } from '@/components/versions-panel';
import {
  clickMessage,
  commentCursor,
  type DatasetDescriptor,
  type FrameClick,
  lineageSource,
  loadCatalog,
  openPaletteMessage,
  type RenderFormat,
  type RenderRequest,
  reader,
  rectMessage,
  type StructureNode,
  sdkVersion,
  toggleCommentMessage,
  toggleInspectMessage,
  togglePromptMessage,
  toggleVersionsMessage,
} from '@/data-app';
import {
  attributeFor,
  createInspectorStore,
  createRequestLog,
  Inspector,
  type InspectorTab,
  type MetricDocs,
  type NodeRequest,
} from '@/inspector';
import {
  catalog,
  type Entry,
  findApp,
  movedTo,
  onRepoEvent,
  pathOf,
  type Redirects,
  urlOf,
} from '@/lib/host';
import { altKey, shiftKey } from '@/lib/shortcut';
import { cn } from '@/lib/utils';

// Numbers each mount of a Data App: the stage and the inspect panel are keyed on it.
let mounts = 0;

export function App() {
  const [entries, setEntries] = useState<Entry[]>();
  const [redirects, setRedirects] = useState<Redirects>({});
  const [datasets, setDatasets] = useState<Record<string, DatasetDescriptor>>();
  const [metricDocs, setMetricDocs] = useState<MetricDocs>();
  const [error, setError] = useState<string>();
  const [path, setPath] = useState(() => pathOf(window.location.pathname));
  // Bumped to remount the Data App: the reload button, and live reload.
  const [revision, setRevision] = useState(0);
  // The right-hand panel: the inspector, the prompt that made the app, or its version history. One at a time.
  const [panel, setPanel] = useState<'inspect' | 'prompt' | 'versions'>();
  const inspecting = panel === 'inspect';
  // The frame has one pick mode: for the inspector, or to comment on a node (src/comments/SPEC.md).
  const [pickFor, setPickFor] = useState<'inspect' | 'comment'>();
  const picking = pickFor === 'inspect';
  const [tab, setTab] = useState<InspectorTab>('overview');
  const [picked, setPicked] = useState<NodeRequest>();
  // The last click in the frame: whether it held Shift, and where; a pick's click is reported just before the pick.
  const lastClick = useRef<{ click?: FrameClick; at: number }>({ at: 0 });
  // The node being commented on, and where its card is anchored; `tracked` while the frame reports its rect.
  const [comment, setComment] = useState<Commented>();
  // A pick whose structure hasn't arrived yet: wait for the frame's snapshot, then open the card.
  const [pendingComment, setPendingComment] = useState<PendingComment>();
  const commenting = pickFor === 'comment' || !!comment || !!pendingComment;
  const commentButton = useRef<HTMLButtonElement>(null);
  // While set, the comment owns the frame outline: the Structure tree's hover/clear must not steal it.
  const heldHighlight = useRef<string | null>(null);
  const [toast, setToast] = useState<Toast>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const stage = useRef<StageHandle>(null);

  const refreshCatalog = useCallback(
    () =>
      catalog().then(
        (read) => {
          setEntries(read.entries);
          setRedirects(read.redirects);
        },
        (err: Error) => setError(`Couldn't list the Data Apps: ${err.message}`),
      ),
    [],
  );
  const refreshDatasets = useCallback(
    () =>
      loadCatalog().then(
        (loaded) => {
          setDatasets(loaded.datasets);
          setMetricDocs(loaded.metricDocs);
        },
        (err: Error) => setError(`Couldn't load the datasets: ${err.message}`),
      ),
    [],
  );

  useEffect(() => {
    void refreshCatalog();
    void refreshDatasets();
  }, [refreshCatalog, refreshDatasets]);

  // Deep links: the address follows the open Data App, and back and forward follow the address.
  useEffect(() => {
    const onPopState = () => setPath(pathOf(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const select = (next: string) => {
    if (next === path) return;
    window.history.pushState(null, '', urlOf(next));
    setPath(next);
  };

  // A new Data App starts with nothing inspected: one inspector store, request log and panel per
  // mounted frame. The stage and the panel are keyed on `mount`, so a new store always comes with a
  // new frame recording into it. A ref, not a memo: React may drop a memo and build it again, which
  // would split the frame from its store; a ref keeps the mount until the app, its revision or the
  // datasets change.
  const mounted = useRef<{ deps: unknown[]; inspector: ReturnType<typeof mountInspector> }>(null);
  const deps = [path, revision, datasets];
  if (!mounted.current || deps.some((dep, i) => !Object.is(dep, mounted.current?.deps[i]))) {
    mounted.current = { deps, inspector: mountInspector() };
  }
  const { inspector } = mounted.current;
  function mountInspector() {
    const requests = createRequestLog();
    const store = createInspectorStore({
      env: {
        hostName: 'anfra demo',
        path,
        sdkVersion,
        reader,
        datasets: datasets ?? {},
        metricDocs,
        lineage: lineageSource,
      },
      requests: requests.log,
      // Comment holds the outline until its card closes; ignore the tree's hover and clear meanwhile.
      highlight: (node) => {
        if (heldHighlight.current) return;
        stage.current?.highlight(node);
      },
      locate: (target) => stage.current?.locate(target),
      download: (node, format) => downloadNode(node, format),
    });
    return { ...store, record: requests.record, mount: ++mounts };
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on each mount
  useEffect(() => {
    setPicked(undefined);
    setPickFor(undefined);
    setComment(undefined);
    setPendingComment(undefined);
    heldHighlight.current = null;
  }, [inspector.mount]);

  // Live reload, in development: a changed Data App reloads if it is the one open; a changed AML
  // reloads the datasets, and with them the open Data App.
  const current = useRef(path);
  current.current = path;
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    return onRepoEvent((event) => {
      if (event.type === 'apps') {
        void refreshCatalog();
        if (current.current && event.paths.includes(current.current)) setRevision((n) => n + 1);
      } else {
        void refreshDatasets();
      }
    });
  }, [refreshCatalog, refreshDatasets]);

  const app = entries && path ? findApp(entries, path) : undefined;
  if (app) document.title = `${app.label} · anfra demo`;

  // An old link to a Data App since moved, renamed or removed: the address is replaced with where it
  // went, as the server would have sent it (the server does, in production, for links it sees).
  const moved = entries && path && !app ? movedTo(entries, redirects, path) : undefined;
  useEffect(() => {
    if (!moved) return;
    window.history.replaceState(null, '', urlOf(moved) + window.location.search + window.location.hash);
    setPath(moved);
  }, [moved]);

  // Pick works on the structure, which the frame reads only while it is inspected: picking opens
  // the panel, and closing the panel ends picking.
  const togglePicking = () => {
    if (!picking) {
      setPanel('inspect');
      // Queries and Lineage take a pick themselves; any other tab goes to Structure.
      if (tab !== 'queries' && tab !== 'lineage') setTab('structure');
      closeComment();
    }
    setPickFor(picking ? undefined : 'inspect');
  };
  const toggleInspecting = () => {
    if (inspecting && picking) setPickFor(undefined);
    setPanel(inspecting ? undefined : 'inspect');
  };

  // Commenting: pick a node, then a card beside it, with the node held highlighted until it closes.
  const closeComment = useCallback(() => {
    heldHighlight.current = null;
    stage.current?.highlight(null);
    stage.current?.track(false);
    setComment(undefined);
    setPendingComment(undefined);
  }, []);
  const closeCard = useCallback(() => {
    closeComment();
    commentButton.current?.focus();
  }, [closeComment]);
  const toggleCommenting = () => {
    if (comment || pendingComment) closeComment();
    else setPickFor(pickFor === 'comment' ? undefined : 'comment');
  };
  // The prompt panel stays chosen across apps, like the inspector, but shows only for an app with a
  // prompt; one without leaves the button off rather than stuck on and disabled.
  const prompting = panel === 'prompt' && !!app?.prompt;
  const togglePrompt = () => {
    if (picking) setPickFor(undefined);
    setPanel(prompting ? undefined : 'prompt');
  };
  // The versions panel (demo data for now) is chosen like the inspector: it shows for any open app.
  const versioning = panel === 'versions' && !!app;
  const toggleVersions = () => {
    if (picking) setPickFor(undefined);
    setPanel(versioning ? undefined : 'versions');
  };

  // Cmd/Ctrl+K for the palette, Alt+Shift+P, Alt+Shift+I and Alt+Shift+V, on the page or forwarded from a Data App's frame (see keyForwarder). Run from
  // a ref, so the listeners don't change with every render.
  const shortcuts = useRef({
    togglePrompt,
    toggleInspecting,
    toggleVersions,
    toggleCommenting,
    hasApp: !!app,
    hasPrompt: !!app?.prompt,
  });
  shortcuts.current = {
    togglePrompt,
    toggleInspecting,
    toggleVersions,
    toggleCommenting,
    hasApp: !!app,
    hasPrompt: !!app?.prompt,
  };
  useEffect(() => {
    const run = (shortcut: 'prompt' | 'inspect' | 'versions' | 'comment') => {
      const { togglePrompt, toggleInspecting, toggleVersions, toggleCommenting, hasApp, hasPrompt } =
        shortcuts.current;
      if (shortcut === 'prompt' && hasPrompt) togglePrompt();
      if (shortcut === 'inspect' && hasApp) toggleInspecting();
      if (shortcut === 'versions' && hasApp) toggleVersions();
      if (shortcut === 'comment' && hasApp) toggleCommenting();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }
      if (!event.altKey || !event.shiftKey || event.metaKey || event.ctrlKey) return;
      const shortcut =
        event.code === 'KeyP'
          ? 'prompt'
          : event.code === 'KeyI'
            ? 'inspect'
            : event.code === 'KeyV'
              ? 'versions'
              : event.code === 'KeyC'
                ? 'comment'
                : undefined;
      if (!shortcut) return;
      event.preventDefault();
      run(shortcut);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data === openPaletteMessage) setPaletteOpen(true);
      if (event.data === togglePromptMessage) run('prompt');
      if (event.data === toggleInspectMessage) run('inspect');
      if (event.data === toggleCommentMessage) run('comment');
      if (event.data === toggleVersionsMessage) run('versions');
      if (event.data?.type === clickMessage && stage.current?.owns(event.source)) {
        lastClick.current = { click: event.data as FrameClick, at: Date.now() };
      }
      if (event.data?.type === rectMessage && stage.current?.owns(event.source)) {
        const rect = event.data.rect as AnchorRect;
        setComment((current) => (current?.tracked ? { ...current, rect } : current));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  const onPick = (node: string | null) => {
    const mode = pickFor;
    if (node) {
      // The frame's click message may land just after the pick report, so read it a moment later, and
      // only if it is that click's: a pick that isn't from a click doesn't inherit an old Shift or rect.
      setTimeout(() => {
        const { click, at } = lastClick.current;
        const recent = click && Date.now() - at < 500 ? click : undefined;
        lastClick.current = { at: 0 };
        if (mode === 'comment') {
          // Comment mode ends with the card opening, in one update: in between, the frame would stop
          // being inspected and drop the structure the highlight needs. The structure may still be
          // on its way; pendingComment waits for it (see the effect below).
          setPickFor(undefined);
          setPendingComment({ key: node, click: recent });
          return;
        }
        // Shift goes to the node's first query or control in Queries; the inspector picks the tab. Queries
        // and Lineage stay open and jump within themselves.
        const inData = !!recent?.shift;
        setPicked({ key: node, nonce: Date.now(), inData });
        if (!inData && tab !== 'queries' && tab !== 'lineage') setTab('structure');
      }, 30);
    }
    // The frame leaves pick mode once something is picked, or when the reader presses Escape.
    if (!node || mode !== 'comment') setPickFor(undefined);
  };

  // The card anchors to the clicked element's rect when it is the picked node's, and follows it;
  // otherwise to the click point, or with no click, the top of the stage (SPEC §4.3).
  const commentOn = (key: string, click: FrameClick | undefined) => {
    const found = findNode(inspector.source.getSnapshot()?.structure.nodes ?? [], key);
    if (!found) return false;
    const tracked = !!click?.rect && click.attr === attributeFor(found.node);
    const rect = tracked ? click?.rect : click ? { x: click.x, y: click.y, width: 0, height: 0 } : undefined;
    setPendingComment(undefined);
    setComment({ ...found, rect, tracked });
    return true;
  };
  // The comment cursor on the page itself too, so it shows the moment Ask AI is clicked, not only
  // once the pointer reaches the frame.
  useEffect(() => {
    if (pickFor !== 'comment') return;
    const style = document.createElement('style');
    style.textContent = `*{cursor:${commentCursor}!important}`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [pickFor]);
  // A pick can land before the frame's first snapshot; wait for one, then give up.
  // biome-ignore lint/correctness/useExhaustiveDependencies: commentOn closes over the current store
  useEffect(() => {
    if (!pendingComment) return;
    const { key, click } = pendingComment;
    if (commentOn(key, click)) return;
    let done = false;
    const undo = inspector.source.subscribe(() => {
      if (done || !commentOn(key, click)) return;
      done = true;
      clearTimeout(timer);
    });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      undo();
      setPendingComment(undefined);
      setToast({ tone: 'error', text: "Couldn't find that element in the page's structure." });
    }, 2000);
    return () => {
      done = true;
      undo();
      clearTimeout(timer);
    };
  }, [pendingComment, inspector.source]);
  // Held from an effect, so it lands after the stage's own: leaving pick mode clears the highlight.
  const commentKey = comment?.node.key;
  const commentTracked = comment?.tracked;
  useEffect(() => {
    if (!commentKey) return;
    heldHighlight.current = commentKey;
    stage.current?.highlight(commentKey);
    if (commentTracked) stage.current?.track(true);
  }, [commentKey, commentTracked]);

  // A picture of the app, or of one node. The browser's own download says it worked; a failure, or
  // images left blank for want of CORS, is told in a toast.
  const download = (request: RenderRequest) => {
    stage.current?.render(request).then(
      ({ omitted }) => {
        if (omitted.length) {
          setToast({
            tone: 'note',
            text: `Saved, with ${omitted.length === 1 ? 'an image' : `${omitted.length} images`} left blank: their servers send no CORS headers.`,
          });
        }
      },
      (err: Error) => setToast({ tone: 'error', text: `Couldn't save the picture: ${err.message}` }),
    );
  };
  const downloadNode = (node: StructureNode, format: RenderFormat) =>
    download(node.kind === 'block' ? { block: node.id, format } : { container: node.id, format });

  let content: React.ReactNode;
  if (error) {
    content = <Message>{error}</Message>;
  } else if (!path) {
    // No app browser: `/` is the root app (server/root.ts), and any other page names none.
    content = <Message>Nothing here.</Message>;
  } else if (entries && !app) {
    content = moved ? <Message>Loading…</Message> : <Message>No Data App at {path}.</Message>;
  } else if (!datasets) {
    content = <Message>Loading…</Message>;
  } else {
    content = (
      <DataAppStage
        key={inspector.mount}
        ref={stage}
        path={path}
        datasets={datasets}
        // Commenting needs the structure, which the frame posts only while it is inspected.
        inspecting={inspecting || commenting}
        picking={!!pickFor}
        cursor={pickFor === 'comment' ? 'comment' : undefined}
        onInspect={inspector.publish}
        record={inspector.record}
        onPick={onPick}
      >
        {comment && app && (
          <CommentCard
            key={comment.node.key}
            node={comment.node}
            rect={comment.rect}
            prompt={(text) =>
              buildCommentPrompt({
                app: { label: app.label, file: `apps/${path}` },
                node: comment.node,
                ancestors: comment.ancestors,
                comment: text,
              })
            }
            onClose={closeCard}
          />
        )}
      </DataAppStage>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      {/* No app browser: the toolbar, and under it the stage, filling the viewport. */}
      <div className="flex h-full min-w-0 flex-col overflow-hidden bg-background">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <h1 className="truncate pl-1 text-sm font-medium">{app?.label ?? 'anfra demo'}</h1>
          {app && <AppInfo app={app} />}
          <ThemeToggle />
          {path && (
            <div className="ml-auto flex items-center gap-1">
              <ToolbarButton label="Reload" disabled={!app} onClick={() => setRevision((n) => n + 1)}>
                <RotateCw />
              </ToolbarButton>
              <ToolbarButton
                label={inspecting ? 'Close the inspect panel' : 'Inspect the Data App'}
                disabled={!app}
                active={inspecting}
                onClick={toggleInspecting}
                text="Inspect"
                shortcut="I"
              >
                <ScanSearch />
              </ToolbarButton>
            </div>
          )}
        </header>
        <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
          <ResizablePanel id="stage" minSize="30%">
            {content}
          </ResizablePanel>
          {inspecting && app && (
            <>
              <ResizableHandle />
              <ResizablePanel id="inspect" defaultSize="440px" minSize="220px" maxSize="60%">
                <Inspector
                  key={inspector.mount}
                  source={inspector.source}
                  tab={tab}
                  onTab={setTab}
                  picked={picked}
                  picking={picking}
                  onTogglePicking={togglePicking}
                  onClose={toggleInspecting}
                />
              </ResizablePanel>
            </>
          )}
          {prompting && app?.prompt && (
            <>
              <ResizableHandle />
              <ResizablePanel id="prompt" defaultSize="320px" minSize="220px" maxSize="60%">
                <PromptPanel prompt={app.prompt} onClose={togglePrompt} />
              </ResizablePanel>
            </>
          )}
          {versioning && (
            <>
              <ResizableHandle />
              <ResizablePanel id="versions" defaultSize="360px" minSize="260px" maxSize="60%">
                <VersionsPanel onClose={toggleVersions} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          // Actions only: no list of apps to go to.
          entries={undefined}
          app={app}
          onSelect={select}
          onReload={() => setRevision((n) => n + 1)}
          onDownload={(format) => download({ format })}
          inspecting={inspecting}
          prompting={prompting}
          onInspect={toggleInspecting}
          onPrompt={togglePrompt}
          versioning={versioning}
          onVersions={toggleVersions}
          commenting={commenting}
          onComment={toggleCommenting}
        />
      </div>
      {toast && <ToastMessage toast={toast} onDone={() => setToast(undefined)} />}
    </TooltipProvider>
  );
}

interface Commented {
  node: StructureNode;
  /** The nodes it sits in, outermost first. */
  ancestors: StructureNode[];
  rect: AnchorRect | undefined;
  /** Whether the frame reports the node's rect as it moves. */
  tracked: boolean;
}

interface PendingComment {
  key: string;
  click: FrameClick | undefined;
}

interface Toast {
  tone: 'note' | 'error';
  text: string;
}

/** A message over the page's corner, gone after a few seconds. */
function ToastMessage({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 6000);
    return () => clearTimeout(timer);
  }, [onDone]);
  return (
    <div
      role="status"
      className={cn(
        'fixed right-4 bottom-4 z-50 max-w-sm rounded-md border px-3 py-2 text-sm shadow-md',
        toast.tone === 'error'
          ? 'border-destructive/40 bg-destructive text-white'
          : 'bg-popover text-popover-foreground',
      )}
    >
      {toast.text}
    </div>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full place-items-center p-6 text-sm text-muted-foreground">{children}</div>;
}

/** An icon button; with `text` it carries a visible label beside the icon, and with `shortcut` its tooltip shows the Alt+Shift keys to press. */
function ToolbarButton({
  label,
  active,
  text,
  shortcut,
  children,
  ...props
}: { label: string; active?: boolean; text?: string; shortcut?: string } & React.ComponentProps<
  typeof Button
>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={text ? 'sm' : 'icon'}
          className={cn(!text && 'size-8', active && 'bg-accent text-accent-foreground')}
          aria-label={label}
          aria-pressed={active}
          {...props}
        >
          {children}
          {text}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && (
          <>
            {' '}
            <KbdGroup>
              <Kbd>{altKey}</Kbd>
              <Kbd>{shiftKey}</Kbd>
              <Kbd>{shortcut}</Kbd>
            </KbdGroup>
          </>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
