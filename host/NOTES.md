# Library host: notes

This is `holistics/anfra-host-example` (Apache-2.0, see `LICENSE` and `NOTICE`), cut down to host one
Data App, the Library (`../app/apps/library.html`), with anfra's real toolbar and Inspect panel around it.
It was developed on the `library-video-host` branch of a fork; this folder is a copy of that branch.

## Run it

There is no server here any more: the page is embedded in the anfra binary in place of anfra's own Data
App pages (`../flake.nix`: `host-page`, `mkAnfra`), and `anfra serve` serves it, the app file and the core
API from one origin. Everything runs inside this repo's nix shell (`nix develop` from the repo root), whose
`anfra` (0.11.1, source build) carries the built page and the pinned sidecars.

### Development

```sh
cd ../app
ANFRA_APPSERVE_DEV_URL=http://localhost:5173 anfra serve --addr 127.0.0.1:7878
# and, in host/:
pnpm install
pnpm dev        # Vite only, on http://localhost:5173
```

- Open http://127.0.0.1:7878/ (or `/apps/library`): with `ANFRA_APPSERVE_DEV_URL` set, anfra redirects its
  pages to Vite, which serves the page from source with hot reload and forwards `/api`, `/appserve` and
  `/health` to anfra (`ANFRA_SERVE_URL`, default `http://127.0.0.1:7878`).
- No live reload of the app: after `pnpm build` in `app/`, press Reload in the toolbar.
- anfra allows only one `serve` per repo: a second one fails with `anfra serve is already running for this repo`.

### Production

The embedded build: `pnpm build` writes `dist/page` (Vite base `/appserve/`), and the flake copies it into
anfra's `internal/appserve/dist` before compiling anfra. `anfra serve` in `../app` (no Vite, no
`ANFRA_APPSERVE_DEV_URL`) then answers:

- `/` and `/apps/library`: the page's `index.html` (`frame-ancestors 'none'`). `/` shows the Library.
- `/appserve/assets/*`: the page's built files (the favicon is in `public/assets/` so it lands there too).
- `/appserve/files/library.html`: the app, which the page fetches and mounts in a sandboxed frame.
- `/api/core.*`: the core API (same-origin POSTs with a JSON body only), `/health`: anfra's status.

The container image (`../flake.nix`) runs exactly this on port 8080.

## What changed and why

| Change | Why |
|---|---|
| Deleted the Node server (`server/`: Hono, the core API allowlist and rate limits, the app catalogue, live reload, link previews, redirects, `/mcp`), `tsconfig.server.json`, `tsconfig.test.json`, the server tests, `public/og-image.png`, and the `hono`, `@hono/node-server`, `yaml` and `concurrently` dependencies | anfra serves the page itself (embedded), so the page talks to anfra directly. |
| `vite.config.ts`: `base: '/appserve/'` for the build; dev proxies `/api`, `/appserve`, `/health` to anfra | anfra serves the embedded files below `/appserve/assets/`. |
| `src/data-app.ts`: the app file from `/appserve/files/` (fetch and `baseHref`) | anfra's file route, sent with `sandbox allow-scripts`. |
| `src/lib/host.ts`: `catalog()` returns the one entry (`library.html`, "Library") statically; `onRepoEvent` is a no-op; redirects and `health()` removed | No `/host/apps` or `/host/events` any more. The page used neither redirects (none configured) nor `health()`. |
| `src/lib/root.ts` (moved from `server/root.ts`): `rootApp = 'library.html'`; `src/lib/entry.ts` (moved from `server/entry.ts`) | Names the one app the host shows; the tree's types. |
| `src/lib/host.ts`: `pathOf('/')` returns `rootApp` | The page shows the Library at `/` without a redirect. `/apps/library` still resolves as before. |
| `src/App.tsx`: removed `SidebarProvider`, `AppSidebar` and `SidebarInset` | No app browser. The page is a single column: the 48 px toolbar, then the stage, which fills the rest of the viewport. |
| `src/App.tsx` toolbar | Kept: title, (i) app info, theme toggle (moved here from the removed sidebar footer), Reload, Inspect. Removed: Download picture, Versions (demo data), Ask AI, Prompt (the Library has no recorded prompt). |
| `src/App.tsx`: the `/` "Home" grid is now "Nothing here." | Only a path that names no app reaches it. |
| Command palette (Ctrl/Cmd+K) gets `entries={undefined}` | It still offers actions (reload, download PNG/PDF, inspect, theme) but no longer lists apps. |
| `src/components/theme-toggle.tsx`: light unless the reader picked dark | Matches the Library's paper sidebar. A choice made with the toggle is remembered in `localStorage['theme']`. |
| Deleted `app-sidebar.tsx`, `home.tsx`, `sidebar-resizer.tsx`, `app-icon.tsx`, `anfra-status.tsx`; removed `filterEntries` and `foldersOf` | Nothing used them once the sidebar was gone. The shadcn `ui/` primitives are left as they were. |

The Inspect panel (`src/inspector/`) and `src/data-app.ts` are unchanged: Overview, Data, Structure,
Queries, Lineage and Wiring. `pnpm typecheck`, `pnpm lint` and `pnpm test` pass (the page's tests only).

Still reachable from the keyboard: Alt+Shift+C (comment, "Ask AI"), Alt+Shift+V (versions panel, demo
data) and Alt+Shift+P (prompt, does nothing for the Library).
