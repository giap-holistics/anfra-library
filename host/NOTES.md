# Library host: notes

This is `holistics/anfra-host-example` (Apache-2.0, see `LICENSE` and `NOTICE`), cut down to host one
Data App, the Library (`../app/apps/library.html`), with anfra's real toolbar and Inspect panel around it.
It was developed on the `library-video-host` branch of a fork; this folder is a copy of that branch.

## Run it

Everything runs inside this repo's nix shell: `cd ~/Dev/anfra-library && nix develop`.

### 1. anfra 0.11.1, core API only

The host is tested against anfra 0.11.1 and `@holistics/anfra-sdk` 0.11.1. Use the release binary (its
sidecars are built in), or the flake's source build with `ANFRA_NODE_BIN` / `ANFRA_CANAL_QUERY_BIN` set:

```sh
cd ../app
ANFRA_SITE_URL=http://localhost:5173 anfra serve --no-apps --addr 127.0.0.1:7878
```

- `--no-apps`: anfra serves no pages, only the core API (and `/mcp`). The host serves the app.
- `--addr 127.0.0.1:7878`: loopback only, because `anfra serve` has no authentication. 7878 is the
  host's default `ANFRA_URL`.
- `ANFRA_SITE_URL`: the address the browser uses to reach the host, so export links point at the host.
  In production, set it to the host's public origin.
- anfra allows only one `serve` per repo: a second one fails with `anfra serve is already running for this repo`.

### 2. The host, in development

```sh
cd host
pnpm install
ANFRA_REPO=$PWD/../app ANFRA_URL=http://127.0.0.1:7878 pnpm dev
```

- Page (Vite): http://localhost:5173. The Library app opens at `/`, and `/apps/library` also works.
- Server (Hono): 127.0.0.1:8787. Vite forwards `/api`, `/host`, `/exports` and `/health` to it.
- When `apps/library.html` changes (`pnpm build` in `app/`), the app reloads in place.

### 3. The host, in production

```sh
pnpm build
NODE_ENV=production ANFRA_REPO=$PWD/../app ANFRA_URL=http://127.0.0.1:7878 PORT=5173 HOSTNAME=127.0.0.1 pnpm start
```

One process (`node dist/server/main.js`) serves the page, the API and the app. `/` and `/apps/library`
return 200 with the Library's link preview (`og:title` "Library"), `/nope` returns 404 and `/health`
reports the host and anfra versions. Other settings: `TRUST_PROXY=1` (take the client from
`X-Forwarded-For`, for the rate limits), `QUERY_RATE_LIMIT` (120/min), `EXPORT_RATE_LIMIT` (10/min),
`MCP=1` (pass anfra's `/mcp` through). The container image (`../flake.nix`) runs exactly this on port 8080.

## What changed and why

| Change | Why |
|---|---|
| `server/root.ts` (new): `rootApp = 'library.html'` | Names the one app the host shows. Both the server and the page import it. |
| `src/lib/host.ts`: `pathOf('/')` returns `rootApp` | The page shows the Library at `/` without a redirect. `/apps/library` still resolves as before. |
| `server/app.ts`: the production shell treats `/` as `rootApp` | In production, `/` gets the Library's title and link preview, not the generic page. |
| `src/App.tsx`: removed `SidebarProvider`, `AppSidebar` and `SidebarInset` | No app browser. The page is a single column: the 48 px toolbar, then the stage, which fills the rest of the viewport. |
| `src/App.tsx` toolbar | Kept: title, (i) app info, theme toggle (moved here from the removed sidebar footer), Reload, Inspect. Removed: Download picture, Versions (demo data), Ask AI, Prompt (the Library has no recorded prompt). |
| `src/App.tsx`: the `/` "Home" grid is now "Nothing here." | Only a path that names no app reaches it. |
| Command palette (Ctrl/Cmd+K) gets `entries={undefined}` | It still offers actions (reload, download PNG/PDF, inspect, theme) but no longer lists apps. |
| `src/components/theme-toggle.tsx`: light unless the reader picked dark | Matches the Library's paper sidebar. A choice made with the toggle is remembered in `localStorage['theme']`. |
| Deleted `app-sidebar.tsx`, `home.tsx`, `sidebar-resizer.tsx`, `app-icon.tsx`, `anfra-status.tsx`; removed `filterEntries` and `foldersOf` | Nothing used them once the sidebar was gone. The shadcn `ui/` primitives are left as they were. |
| `tsconfig.page.json` includes `server/root.ts` | The page's build reads that file. |

The Inspect panel (`src/inspector/`) and `src/data-app.ts` are unchanged: Overview, Data, Structure,
Queries, Lineage and Wiring. `pnpm typecheck`, `pnpm lint` and `pnpm test` pass.

Still reachable from the keyboard: Alt+Shift+C (comment, "Ask AI"), Alt+Shift+V (versions panel, demo
data) and Alt+Shift+P (prompt, does nothing for the Library).
