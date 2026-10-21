# anfra host example

A host for [anfra](https://github.com/holistics/anfra) Data Apps that you run yourself, in place of the appserve pages `anfra serve` has built in. It is a reference for putting Data Apps in a page of your own: everything it needs from anfra is the published [`@holistics/anfra-sdk`](https://www.npmjs.com/package/@holistics/anfra-sdk) and the core HTTP API.

- A sidebar lists the repo's Data Apps; each opens at `/apps/<path>`.
- The stage runs the open Data App in a sandboxed frame, on the SDK's plugin host with every plugin anfra has. Its queries come back to the page over the SDK's bridge and are answered by anfra through this host's server. So are its exports (a Data App's `query.export()` downloads a query's whole result as a CSV) and its lineage (`Anfra.lineage()` traces fields through the repo's catalog).
- Pictures: the toolbar downloads a PNG or PDF of the whole app, a node's row in the Structure tab one of that container or block, and a Data App can save its own with `Anfra.render()`. The SDK draws them in the frame; this host turns that on by installing the `render` plugin (in [`src/data-app.ts`](src/data-app.ts)), since it has the page save a file the app's code made. Install it only for apps you trust with that.
- A toolbar reloads the app, and opens the inspect panel:
  - Structure: the app's parts as its markup declares them, as a tree. Hover a node to highlight it on the page, click to scroll to it, copy its handle (`[Revenue](data-anfra-block="revenue")`) to point an agent at it, or download a picture of it. Pick mode goes from the page to the tree.
  - Data: every app's queries (state, rows, executed AQL and SQL), controls and selection, and every call the frame made through the plugins (exports, lineage, pictures saved), recorded by a middleware.
- Light or dark follows the system until you pick one with the toggle next to the title.
- In development, the open app reloads when its file or the AML changes.

Tested with anfra 0.11.1 and `@holistics/anfra-sdk` 0.11.1. Bump them together: the SDK is released with anfra.

## How it fits together

```
browser                          this host (Node, Hono)                 anfra serve --no-apps
┌──────────────────────┐        ┌────────────────────────────┐         ┌────────────────────┐
│ page (React)         │ /api   │ allowlist, rate limit,     │ /api    │ core API           │
│  └ frame: Data App ──┼─bridge─┤ "your auth goes here"  ────┼────────▶│ (no auth: private) │
│                      │ /host  │ apps/ read from ANFRA_REPO │         └────────────────────┘
└──────────────────────┘        └────────────────────────────┘
```

- **anfra** answers the core API only. Run with `--no-apps`, it serves no pages, and it must listen where only this server can reach it: `anfra serve` has no authentication.
- **The server** (`server/`) is the one origin the browser talks to:
  - `/api/core.show`, `/api/core.query`, `/api/core.query.export` and `/api/core.lineage`, passed to anfra, and `/api/core.search` for one question only (the catalog's models, for the inspector's Lineage tab), and nothing else of the core API. Queries, exports, lineage and that search are rate-limited per client, each with its own limit (lineage and the search count against the query limit's number). The spot to check your own session is marked in `server/anfra.ts`.
  - `/exports/download/<token>/<name>`: an export's file, streamed from anfra. anfra makes its export links at this server's origin (`ANFRA_SITE_URL`, below), so the browser downloads through here, never from anfra directly. A link works for whoever has it until it expires; a host whose readers sign in checks the session here too (marked in `server/anfra.ts`).
  - `/host/apps` (the Data App tree, labelled by each file's `<title>`, and the [redirects](#redirects)), `/host/files/<path>` (a definition or a file it refers to, sent sandboxed) and, in development, `/host/events` (live reload). The core API has nothing to list or read app files, so the server reads them from the repo's `apps/` folder itself.
  - `/health`: this host's version and anfra's, or 503 while anfra does not answer.
  - With `MCP=1`, `/mcp`: anfra's MCP endpoint, passed through. See [MCP](#mcp).
  - In production, the built page, with each Data App's [link preview](#link-previews), and a 301 for an old link to a Data App since moved ([redirects](#redirects)).
- **The page** (`src/`): every call into the SDK is in [`src/data-app.ts`](src/data-app.ts). That file is the part to copy into a host of your own; the rest is UI.

## Run it

You need Node 22 or newer, pnpm, and anfra.

1. Start anfra on the Data Folder, without its own pages:

   ```sh
   cd path/to/your/data-folder && anfra serve --no-apps
   ```

   Set `ANFRA_SITE_URL` to where the browser reaches this host, so the export links anfra makes point here: `http://localhost:5173` in development. Without it, a link points at anfra's own address, which the browser can't reach.

   Or `pnpm dev:anfra`, which does the same in `ANFRA_REPO`, with `ANFRA_SITE_URL` at `http://localhost:5173` unless you set it. With Docker:

   ```sh
   docker run --rm -p 127.0.0.1:7878:7878 -e ANFRA_SITE_URL=http://localhost:5173 -v "$PWD:/repo" ghcr.io/holistics/anfra:0.11.1 serve --no-apps --addr 0.0.0.0:7878
   ```

2. Start the host:

   ```sh
   pnpm install
   ANFRA_REPO=path/to/your/data-folder pnpm dev
   ```

   Open http://localhost:5173. Vite serves the page with hot reload and passes `/api`, `/host`, `/exports` and `/health` to the server on port 8787.

`.npmrc` points the `@holistics` scope at npmjs, in case your own npm config sends it elsewhere.

### Production

```sh
pnpm build
NODE_ENV=production ANFRA_REPO=… ANFRA_URL=… PORT=5173 HOSTNAME=0.0.0.0 pnpm start
```

Run anfra with `ANFRA_SITE_URL` at this host's public origin (`https://data.example.com`). One process serves the page, the API and the Data Apps. It reads the app tree once at startup and does not watch the repo. Built assets are cached for a year (their names are hashed); definitions for a minute, with an ETag.

## Configuration

| Variable | Default | |
|---|---|---|
| `ANFRA_REPO` | `../demo-data` | The Data Folder anfra serves. Data Apps are its `apps/**/*.html`. |
| `ANFRA_URL` | `http://127.0.0.1:7878` | Where anfra answers. Keep it off the public network. |
| `PORT`, `HOSTNAME` | `8787`, `127.0.0.1` | Where this server listens. |
| `NODE_ENV` | | `production` serves the built page, without live reload. |
| `QUERY_RATE_LIMIT` | `120` | `core.query` requests a minute per client, and each of `core.lineage` and `core.search`. |
| `EXPORT_RATE_LIMIT` | `10` | `core.query.export` requests a minute per client. Each runs its query to the last row. |
| `MCP` | | `1` passes anfra's MCP endpoint through at `/mcp`. See [MCP](#mcp). |
| `TRUST_PROXY` | | `1` takes the client's address from `X-Forwarded-For`: the last entry, which the one proxy in front of this server appends. |
| `ANFRA_SITE_URL` | | This host's public origin, for the absolute links in [link previews](#link-previews). Without it, each request's origin (with `X-Forwarded-Proto` under `TRUST_PROXY=1`). |

## Link previews

A link to a Data App shared in Slack, a chat app or a social site shows the app's title, a description and an image. Their crawlers run no script, so in production the server writes the tags (`og:*`, `twitter:card`) into the page it sends for `/apps/<path>`, from the definition's own head:

- the title: `og:title`, else `<title>`, else the file name;
- the description: `og:description`, else `<meta name="description">`, else a line about Data Apps;
- the image: `og:image`, a URL or a path relative to the definition, else [`public/og-image.png`](public/og-image.png), the anfra card. A file under `apps/` that isn't there shows the default (and is warned of at startup).

An image under `apps/`, and the default, gets `?v=` and a short hash of its bytes, read at startup, so a crawler that caches images by URL (Facebook, LinkedIn) fetches a changed one. They are said to be 1200x630 (`og:image:width`, `og:image:height`), as no image is read to learn its size: pre-render them at that size in the Data Folder, as anfra-demo-data's `scripts/og_snapshots.py` does. Every image gets `og:image:type` from its extension (png, jpg, webp) and `og:image:alt`, the title.

```html
<title>Funnel Analysis</title>
<meta name="description" content="A customer funnel over ecommerce orders, with breakdowns and drill-downs.">
<meta property="og:image" content="funnel-analysis.png">
```

Set `ANFRA_SITE_URL` to this host's public origin, as for anfra, so the links in the tags point there.

## Folder and app metadata

A repo can say how its folders and Data Apps are shown in an optional `apps/_meta.yaml` (or `_meta.yml`). Keys are paths relative to `apps/` (a Data App's with its `.html`), so renaming something here never changes a URL. Every field is optional; without the file, folders are named by their directory, apps by their `<title>`, and everything is open and alphabetical. The same file lists where moved Data Apps went: see [Redirects](#redirects).

```yaml
folders:
  sales/:
    name: Sales & Revenue   # shown in place of the directory name
    description: Revenue, pipeline and forecasts.  # under its header on the home page; on hover in the sidebar
    icon: wallet
    tags: [finance, weekly]
    collapsed: true         # starts closed (open anyway if it holds the open app)
    order: 1                # before the unordered, lowest first
apps:
  sales/overview.html:
    name: Revenue overview  # shown in place of the <title>
    icon: chart-line
    tags: [kpi]
    endorsed: true          # a green check on its icon
    order: 1
```

- `icon` is one of the names in `server/entry.ts` (lucide, kebab-case); an unknown one is logged and falls back to the default.
- `description` (folders) is one line on what the folder holds.
- `endorsed: true` (Data Apps) puts a small green check on the icon's bottom right.
- The sidebar's filter matches names and tags.
- `order` puts entries first, lowest first; the rest follow by file name.
- A Data App's link preview takes its own `og:title` first, then `name`, then its `<title>`.
- The server logs each problem once while it lasts: unknown fields, a field on the wrong kind (`endorsed` on a folder), a key written twice (`sales` and `sales/`), a key under the wrong section, and keys that match nothing.

## Redirects

Links to a Data App get shared (Slack, READMEs, other sites), and break when it is moved, renamed or deleted. List where the old paths went under `redirects` in the same `apps/_meta.yaml`, as the repo that moves the apps owns their URLs:

```yaml
redirects:
  reports/: dashboards/                  # a folder: everything in it moved
  reports/cashflow: archive/cashflow     # one Data App; wins over its folder's rule
  "Fancy Demos/": playground/            # names as they are, spaces and all
  sales-overview: dashboards/ecommerce   # a deleted app: send its readers to the nearest one
```

- Paths are as the page's URL has them under `/apps/`: relative to `apps/`, decoded, without `.html`. A key ending in `/` is a folder, and its value must end in `/` too; any other key is one Data App.
- A Data App's own rule wins over a folder's; of two folders, the longer.
- Chains are followed: after `a: b` and `b: c`, `a` goes to `c`. So moving an app again needs one more rule, not an edit of every old one.
- Only a path that names no Data App is redirected: an app at that path again is served, and its rule is idle. A rule that ends nowhere, or loops, is idle too.
- In production, the server answers `/apps/<old>?<query>` with a 301 to `/apps/<new>?<query>` before it sends the page, so link previews and browsers both land on the app. `/host/files/<old>.<ext>` (the definition, its preview image) goes to the file of the same name where the app went, when that file is there. A 301 is cached for an hour, not for good, as a path moved away may come back.
- The page follows the same rules (`server/redirect.ts`, shared) for an old address it meets without the server: in development, where Vite serves the page, and on back or forward to a page since moved. It replaces the address in place.
- The server logs, once while it lasts: an old path that is still there, a new one that names no Data App (or folder) after any chain, a loop, a folder rule whose value is no folder, a key written with `.html`.

## MCP

With `MCP=1`, the server passes anfra's MCP endpoint (streamable HTTP) through at `/mcp`, so an agent can connect to `https://<this host>/mcp`. It is a plain passthrough, for demos: unlike `/api`, it has no allowlist, no rate limit and no auth spot. Every op anfra serves as a tool is reachable, except `core.ingest`, which rebuilds the search catalog and is refused here.

- Run anfra without `--no-mcp`: `anfra serve --no-apps` serves `/mcp`.
- `core.query.export` answers with a link to the file, downloaded through this server as a Data App's export is (`/exports/download/*`, served with or without `MCP=1`), so start anfra with `ANFRA_SITE_URL` set to this host's public URL, such as `https://demo.anfra.ai`.

## Checks

```sh
pnpm typecheck
pnpm test      # node:test, through tsx: server/*.test.ts
pnpm lint      # Biome; pnpm format to fix
pnpm build
```

## Layout

```
server/
  main.ts      start: config, listen
  app.ts       the routes
  anfra.ts     /api: the allowlist, rate limits, auth spot; export downloads; /health
  mcp.ts       /mcp, passed to anfra (MCP=1)
  catalog.ts   the Data App tree
  meta.ts      apps/_meta.yaml: names, icons, order, redirects
  redirect.ts  following redirects, shared with the page
  files.ts     a file under apps/, confined and sandboxed
  events.ts    live reload: the repo watched, changes debounced
src/
  data-app.ts  every SDK call: datasets, the reader, mounting a Data App
  App.tsx      layout, routing, live reload
  components/  sidebar, home, stage; ui/ is shadcn/ui
  inspector/   the inspect panel, self-contained to carry to another host; SPEC.md says how
  lib/host.ts  what the page asks the server, apart from the core API
```

## License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
