// Everything this host asks of the Anfra SDK, in one place. A host of your own needs these calls
// and nothing else from the SDK; the rest of this project is UI around them.
//
//   @holistics/anfra-sdk/api      talks to the core API: the datasets, and a Backend for queries
//   @holistics/anfra-sdk/host     the plugin host: mounts a Data App in a sandboxed frame, and
//                                 answers its calls over the bridge with the plugins installed
//   @holistics/anfra-sdk/plugins  anfra's plugins: queries, exports, lineage, pictures, inspect
import { coreApiBackend, coreClient, toDescriptor } from '@holistics/anfra-sdk/api';
import type {
  DatasetDescriptor,
  InspectedApp,
  InspectedStructure,
  LineageResult,
  LocateTarget,
  Rendering,
  RenderRequest,
  User,
} from '@holistics/anfra-sdk/common';
import { type CallContext, createHost, type Host, type Middleware } from '@holistics/anfra-sdk/host';
import {
  corePlugin,
  exportPlugin,
  inspectPlugin,
  lineagePlugin,
  renderPlugin,
} from '@holistics/anfra-sdk/plugins';
import { dependencies } from '../package.json';
import type { LineageSource, MetricDoc, MetricDocs, ModelTable } from './inspector';

export type {
  DatasetDescriptor,
  InspectedApp,
  InspectedStructure,
  LocateTarget,
  RenderFormat,
  Rendering,
  RenderRequest,
  StructureNode,
} from '@holistics/anfra-sdk/common';

/**
 * The SDK version frames are mounted with: the one this host pins. The SDK exports its own only from
 * the in-frame bundle, which the page has no other reason to load.
 */
export const sdkVersion: string = dependencies['@holistics/anfra-sdk'];

/**
 * anfra's core API, on the same origin (anfra serves this page): `core.show`, `core.query`,
 * `core.query.export`, `core.lineage` and `core.search`.
 */
const api = coreClient('/api');

/** The part of a `core.show` field the inspector shows. A format is as the AML declares it: text, or something else. */
function docOf(field: {
  label?: string;
  description?: string;
  definition?: string;
  type: string;
  format?: unknown;
}): MetricDoc {
  const { label, description, definition, type, format } = field;
  return { label, description, definition, type, format: typeof format === 'string' ? format : undefined };
}

/**
 * Every dataset a Data App may query, from `core.show`: each frame is provisioned with them. With
 * them, what the catalog says of each metric and field, which the descriptor leaves out: the
 * inspector shows it. This is what `loadDatasets` does, keeping the part it drops.
 */
export async function loadCatalog(): Promise<{
  datasets: Record<string, DatasetDescriptor>;
  metricDocs: MetricDocs;
}> {
  const { data, error, response } = await api.POST('/core.show', { body: {} });
  if (!data) throw new Error(error?.error?.message ?? `core.show answered ${response.status}.`);
  if (data.object.kind !== 'repo') throw new Error(`core.show answered a ${data.object.kind}, not the repo.`);
  for (const d of data.diagnostics) console.warn('anfra:', d.message);
  const datasets: Record<string, DatasetDescriptor> = {};
  const metricDocs: MetricDocs = {};
  for (const dataset of data.object.datasets) {
    // A dataset that cannot be shown in full comes in outline, and is left out.
    if (!dataset.models) continue;
    datasets[dataset.fqn] = toDescriptor(dataset);
    const docs: Record<string, MetricDoc> = {};
    for (const metric of dataset.metrics ?? []) {
      docs[metric.name] = docOf(metric);
    }
    for (const model of dataset.models) {
      for (const field of model.fields) {
        const doc = docOf(field);
        docs[`${model.name}.${field.name}`] = doc;
        // A column names its model as the query does, which can be the fqn.
        docs[`${model.fqn}.${field.name}`] ??= doc;
      }
    }
    metricDocs[dataset.fqn] = docs;
  }
  return { datasets, metricDocs };
}

/**
 * The catalog's lineage, for the inspector's Lineage tab: what each field is built from, and the
 * table each model reads. Both read the catalog `anfra ingest` built, not the warehouse.
 *
 * The trace is the `lineage` plugin's call, made as this page on the plugin host the open Data App
 * runs on: the same plugin and middleware as the app's own `Anfra.lineage()`. The tables are a
 * search, which no plugin answers, so they go to the core API directly.
 */
export const lineageSource: LineageSource = {
  trace(targets, signal) {
    if (!host) return Promise.reject(new Error('No Data App is open.'));
    return host.runtime.call<LineageResult>('lineage.trace', { targets }, { signal });
  },
  async tables(signal) {
    // The one search this host's server lets through. Its answer is untyped: read it with care.
    const { data, error, response } = await api.POST('/core.search', {
      body: { query: ['type:aml.model'] },
      signal,
    });
    if (!data) throw new Error(error?.error?.message ?? `core.search answered ${response.status}.`);
    const tables: Record<string, ModelTable> = {};
    const entities = Array.isArray(data.entities) ? data.entities : [];
    for (const entity of entities) {
      const p = (entity as { properties?: Record<string, unknown> }).properties ?? {};
      const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
      const fqn = text(p.fqn);
      if (!fqn) continue;
      const name = text(p.name) ?? fqn;
      const table: ModelTable = {
        model: { fqn, name, label: text(p.label), description: text(p.description) },
        table: text(p.table_name),
        dataSource: text(p.data_source_name),
      };
      tables[fqn] = table;
      tables[name] ??= table;
    }
    return tables;
  },
};

/**
 * Who reads the Data Apps. A real host takes this from its own session: who is signed in, their
 * time zone, and what they may do. The permissions are display hints for the app (whether it
 * offers SQL, an export or a picture); what a reader may actually query is decided on the server.
 */
export const reader: User = {
  id: 1,
  name: 'Demo reader',
  email: 'reader@example.com',
  role: 'viewer',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  permissions: { canViewGeneratedSql: true, canExportData: true },
};

/** Posted to the host by a frame when the reader presses a shortcut, as keys in a frame never reach the host. */
export const focusFilterMessage = 'anfra-host:focus-filter';
export const openPaletteMessage = 'anfra-host:open-palette';
export const toggleSidebarMessage = 'anfra-host:toggle-sidebar';
export const togglePromptMessage = 'anfra-host:toggle-prompt';
export const toggleInspectMessage = 'anfra-host:toggle-inspect';
export const toggleCommentMessage = 'anfra-host:toggle-comment';
export const toggleVersionsMessage = 'anfra-host:toggle-versions';
/**
 * Posted for every click in a frame, with whether Shift was held: the frame's pick report doesn't
 * say, and a click's message always comes first, as the frame's listener sits on the window. It
 * also carries the click point and the closest marked element's attribute and rect, which the
 * pick report doesn't either: a comment's card is anchored to them.
 */
export const clickMessage = 'anfra-host:click';
/** Posted by the host to a frame: keep reporting the last clicked marked element's rect, or stop. */
export const trackMessage = 'anfra-host:track';
/** Posted by a frame while tracking, when the tracked element may have moved (scroll, resize). */
export const rectMessage = 'anfra-host:rect';
/** Posted by the host to a frame: show the comment cursor (an arrow with a speech bubble), or the usual one. */
export const cursorMessage = 'anfra-host:cursor';

/** The comment cursor: an arrow, its tip the hotspot, with a speech bubble at its lower right. */
const commentCursorSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M3 2v18.5l4.6-4.4 3.2 7.2 3-1.3-3.2-7.1h6.2z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><g transform="translate(13.5 12.5) scale(0.78)"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" fill="#4f46e5" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></g></svg>`;
/** Every element's cursor while the frame's root carries `data-anfra-host-cursor`; crosshair where SVG cursors aren't drawn. */
export const commentCursor = `url("data:image/svg+xml,${encodeURIComponent(commentCursorSvg)}") 3 2,crosshair`;
const commentCursorCss = `html[data-anfra-host-cursor],html[data-anfra-host-cursor] *{cursor:${commentCursor}!important}`;

/** A rect in the frame's viewport. */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What a frame's click message says. */
export interface FrameClick {
  type: typeof clickMessage;
  shift: boolean;
  x: number;
  y: number;
  /** The closest marked element's attribute, as written: `data-anfra-block="river"`. */
  attr?: string;
  rect?: FrameRect;
}

/**
 * Appended to each definition: the frame is sandboxed, so the host can't listen for keys in it. It
 * forwards the host's shortcuts (Cmd/Ctrl+K for the palette, `/` for the filter, Cmd/Ctrl+B for the sidebar,
 * Alt+Shift+P for the prompt, Alt+Shift+I for inspect, Alt+Shift+C to comment),
 * which the host answers, and reports each click for picking (see clickMessage).
 */
const keyForwarder = `<script>addEventListener('keydown',function(e){var t=e.target,m=(e.metaKey||e.ctrlKey)&&!e.altKey,k=e.key.toLowerCase(),a=e.altKey&&e.shiftKey&&!e.metaKey&&!e.ctrlKey,r=a&&e.code==='KeyP'?'${togglePromptMessage}':a&&e.code==='KeyI'?'${toggleInspectMessage}':a&&e.code==='KeyC'?'${toggleCommentMessage}':a&&e.code==='KeyV'?'${toggleVersionsMessage}':m&&k==='b'?'${toggleSidebarMessage}':m&&k==='k'?'${openPaletteMessage}':e.key==='/'&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))?'${focusFilterMessage}':0;if(r){e.preventDefault();parent.postMessage(r,'*')}},true);</script>`;

/**
 * Appended too: reports each click with the closest marked element, and while the host asks
 * (trackMessage), that element's rect whenever it may have moved, at most once a frame. On
 * cursorMessage it shows the comment cursor, or stops.
 */
const clickReporter = `<script>(function(){var K=['container','block','query','control'],S=K.map(function(k){return'[data-anfra-'+k+']'}).join(','),el=null,on=false,raf=0;function box(n){var r=n.getBoundingClientRect();return{x:r.left,y:r.top,width:r.width,height:r.height}}function attr(n){for(var i=0;i<K.length;i++){var v=n.getAttribute('data-anfra-'+K[i]);if(v!==null)return'data-anfra-'+K[i]+'="'+v+'"'}}addEventListener('click',function(e){var t=e.target&&e.target.closest?e.target.closest(S):null;el=t;parent.postMessage({type:'${clickMessage}',shift:e.shiftKey,x:e.clientX,y:e.clientY,attr:t?attr(t):undefined,rect:t?box(t):undefined},'*')},true);function post(){raf=0;if(on&&el&&el.isConnected)parent.postMessage({type:'${rectMessage}',rect:box(el)},'*')}function queue(){if(on&&!raf)raf=requestAnimationFrame(post)}addEventListener('scroll',queue,true);addEventListener('resize',queue);var css=null;function cursor(show){if(show&&!css){css=document.createElement('style');css.textContent=${JSON.stringify(commentCursorCss)};document.head.appendChild(css)}document.documentElement.toggleAttribute('data-anfra-host-cursor',show)}addEventListener('message',function(e){if(e.source!==parent||!e.data)return;if(e.data.type==='${trackMessage}'){on=!!e.data.on;queue()}if(e.data.type==='${cursorMessage}')cursor(!!e.data.on)})})()</script>`;

/** A Data App definition, as its author wrote it, and where its relative URLs resolve. */
export async function definition(path: string): Promise<{ html: string; baseHref: string }> {
  const file = path.split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`/appserve/files/${file}`);
  if (!response.ok) throw new Error(`Couldn't read ${path}: the server answered ${response.status}.`);
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
  // Absolute: the frame's document is a srcdoc, so a relative base would resolve against nothing useful.
  return {
    html: (await response.text()) + keyForwarder + clickReporter,
    baseHref: `${window.location.origin}/appserve/files/${dir}`,
  };
}

/** Records one of a frame's calls, then passes it on: a middleware's `handle`. */
export type RecordCall = (
  request: unknown,
  context: CallContext,
  next: (request?: unknown) => Promise<unknown>,
) => Promise<unknown>;

export interface MountOptions {
  container: HTMLElement;
  path: string;
  datasets: Record<string, DatasetDescriptor>;
  /** The frame's inspection snapshots, while inspecting: its apps, and the structure its markup declares. */
  onInspect: (apps: InspectedApp[], structure: InspectedStructure) => void;
  /** In pick mode, the node the reader pointed at (its key), or null when they left the mode. */
  onPick: (node: string | null) => void;
  /** Sees every call about this frame, through the host's middleware: to record them for the inspector. */
  record?: RecordCall;
}

/** What the page does with a mounted Data App. */
export interface DataApp {
  frame: HTMLIFrameElement;
  setInspecting: (open: boolean) => void;
  setPicking: (on: boolean) => void;
  highlight: (node: string | null) => void;
  locate: (target: LocateTarget) => void;
  /**
   * Save a PNG or PDF of the app, or of one block or container, once its running queries settle.
   * Resolves with what was saved; `omitted` lists the images left blank, since their servers send
   * no CORS headers.
   */
  render: (request: RenderRequest) => Promise<Rendering>;
  unmount: () => void;
}

/** Each mounted frame's recorder, by its frame: the one middleware hands each call to its frame's. */
const recorders = new WeakMap<HTMLIFrameElement, RecordCall>();

/** Every call on the page passes through it; those about a recorded frame go to its recorder. */
const recording: Middleware = {
  name: 'anfra-host.requests',
  match: '*',
  handle(request, context, next) {
    const record = context.mount && recorders.get(context.mount.frame);
    return record ? record(request, context, next) : next();
  },
};

/**
 * The page's plugin host: every plugin anfra has, over the core API through this host's server.
 * Made again when the datasets are (an AML change), since the Backend resolves fields against them.
 *
 * - `core` runs the app's queries and suggests a filter's values, by `core.query`.
 * - `export` makes a query's whole result a file, by `core.query.export`: the SDK saves it from
 *   this page, by following the link anfra made at this host's origin.
 * - `lineage` traces fields through the repo's catalog (`Anfra.lineage()`), by `core.lineage`.
 * - `render` draws a PNG or PDF of the app in the frame (`Anfra.render()` in the app,
 *   `render.draw` here), and has this page save it: installing it is the opt-in, since the app's
 *   own code then chooses a file this host's origin downloads. The SDK lets through only a PNG or a
 *   PDF; install it only for apps you trust with that, as this host does for its own repo.
 * - `inspect` carries the inspect panel's snapshots, highlight, locate and pick; the panel is this
 *   host's own (src/inspector).
 *
 * A Data App sees what is installed as `Anfra.plugins`: leave one out, and apps offer none of it.
 */
let host: { datasets: Record<string, DatasetDescriptor>; runtime: Host } | undefined;
function hostFor(datasets: Record<string, DatasetDescriptor>): Host {
  if (host?.datasets !== datasets) {
    const backend = coreApiBackend(api, { datasets });
    host = {
      datasets,
      runtime: createHost({
        plugins: [
          corePlugin(backend),
          exportPlugin(backend),
          lineagePlugin(backend),
          renderPlugin(),
          inspectPlugin(),
        ],
        middleware: [recording],
      }),
    };
  }
  return host.runtime;
}

/**
 * Mount a Data App in `container`: a sandboxed frame running its definition, with the SDK, the
 * plugins' frame halves and the datasets provisioned ahead of it. Its calls come back to this page
 * over the bridge, and the plugins answer them (see `hostFor`).
 */
export async function mount(options: MountOptions): Promise<DataApp> {
  const { html, baseHref } = await definition(options.path);
  const mounted = hostFor(options.datasets).mount({
    container: options.container,
    definition: html,
    baseHref,
    datasets: options.datasets,
    user: reader,
    title: options.path,
  });
  // Before the frame's document loads, so its first calls are recorded.
  if (options.record) recorders.set(mounted.frame, options.record);
  const stop = [
    mounted.on(
      'inspect.snapshot',
      ({ apps, structure }: { apps: InspectedApp[]; structure: InspectedStructure }) =>
        options.onInspect(apps, structure),
    ),
    mounted.on('inspect.picked', ({ node }: { node: string | null }) => options.onPick(node)),
  ];
  // What the page asks of the frame answers nothing worth waiting for; a failure is only logged.
  const send = (name: string, request: unknown) => {
    mounted.call(name, request).catch((err: Error) => console.warn('anfra:', err.message));
  };
  return {
    frame: mounted.frame,
    setInspecting: (open) => send('inspect.watch', open),
    setPicking: (on) => send('inspect.pick', on),
    highlight: (node) => send('inspect.highlight', node),
    locate: (target) => send('inspect.locate', target),
    render: (request) => mounted.call<Rendering>('render.draw', request),
    unmount() {
      for (const off of stop) off();
      recorders.delete(mounted.frame);
      mounted.unmount();
    },
  };
}
