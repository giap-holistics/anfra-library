# anfra Library: the Data App and its host

The Library Data App (a 3D drill-down over a governed anfra semantic layer, built for the 2026 anfra App
Competition) together with the custom host that shows it with anfra's toolbar and Inspect panel, packaged
as one container image.

Live: https://anfra-library.pages.holistics.dev (public, no auth). The app is at `/`.

## Layout

| Path | What |
|---|---|
| `app/` | The anfra Data Folder: `models/`, `datasets/` (AML), `apps/library.html` (the built app), `src/` + `build.mjs` (its source and esbuild build), `data/` (`library.duckdb` and the pipeline that makes it), `.anfra/` (`data_sources.yml.example`, `context_sources.yml`). Its own doc: [`app/README.md`](app/README.md). |
| `host/` | The host: a fork of [holistics/anfra-host-example](https://github.com/holistics/anfra-host-example) (Apache-2.0, `host/LICENSE`, `host/NOTICE`), cut down to the one app. Hono server + React page. What changed and how to run it: [`host/NOTES.md`](host/NOTES.md); upstream doc: `host/README.md`. |
| `flake.nix`, `flake.lock` | Dev shell, anfra v0.11.1 built from source, and the `image` output. |
| `deploy.sh` | Build the host, build the image, push it to GHCR, update the prototypes deployment. |

## Run locally

```sh
cd ~/Dev/anfra-library && nix develop      # node 22, pnpm, tsc, esbuild, duckdb, skopeo, go
nix build .#anfra -o result-anfra          # or use the v0.11.1 release binary (sidecars built in)
# a source build embeds no sidecars: the shell points ANFRA_NODE_BIN / ANFRA_CANAL_QUERY_BIN at $ANFRA_SIDECARS
# (default ~/Dev/anfra/.sidecars: anfra-node v0.8.0 + canal-query 2.19.1, from `make sidecars` in an anfra checkout)

cp app/.anfra/data_sources.yml.example app/.anfra/data_sources.yml   # set the absolute path to app/data/library.duckdb
(cd app && pnpm install && pnpm build)     # only after changing app/src

# host + core-only anfra
(cd app && ANFRA_SITE_URL=http://localhost:5173 ../result-anfra/bin/anfra serve --no-apps --addr 127.0.0.1:7878) &
(cd host && pnpm install && ANFRA_REPO=$PWD/../app ANFRA_URL=http://127.0.0.1:7878 pnpm dev)   # http://localhost:5173/

# or anfra's built-in pages, without the host
(cd app && ../result-anfra/bin/anfra serve --addr 127.0.0.1:3000)   # http://127.0.0.1:3000/apps/library
```

anfra allows one `serve` per repo: run the core-only server or the built-in one, not both.

## Image

`nix build --impure .#image.x86_64-linux` (`dockerTools.buildLayeredImage`, linux/amd64, ~217 MB compressed).
Three impure inputs, absolute paths in the environment:

- `ANFRA_SIDECARS`: folder holding `anfra-node` and `canal-query` (see above).
- `LIBRARY_REPO`: `$PWD/app`, filtered (no `node_modules`, `src`, raw data, CSVs, build files); the image
  writes its own `.anfra/data_sources.yml` pointing at `/tmp/lib/data/library.duckdb`.
- `HOST_PROD`: the host built for production (`dist/`, `package.json`, production `node_modules`);
  `deploy.sh` stages it in a temp dir.

Contents: anfra (source build, web UI embedded), the sidecars in `/opt/anfra`, node 22, the Data Folder
in `/srv/library`, the host in `/srv/host`, bash, coreutils, CA certs, tzdata, fakeNss.

The start command (bash, PID 1):

1. `cp -rL /srv/library /tmp/lib`.
2. `anfra serve --no-apps --no-watch --no-mcp --addr 127.0.0.1:7878` in the background, with
   `ANFRA_SITE_URL=https://anfra-library.pages.holistics.dev`. anfra is reachable only from inside the
   container; it has no authentication.
3. Waits up to 120 s for anfra's `/health` (exits if anfra dies first).
4. Starts the host: `NODE_ENV=production ANFRA_REPO=/tmp/lib ANFRA_URL=http://127.0.0.1:7878 PORT=8080
   HOSTNAME=0.0.0.0 TRUST_PROXY=1 node dist/server/main.js` from `/srv/host`.
5. `wait -n`: when either process exits, it stops the other and the container exits non-zero, so the
   platform restarts the pod. SIGTERM stops both.

`ANFRA_PORT` and `PORT` override 7878 and 8080, only so the image can be smoke-tested next to other servers.

## Deploy

```sh
set -a && . ~/Dev/anfra-competition/.env && set +a && export PROTO_GITHUB_TOKEN="$PROTO_GH_TOKEN"
./deploy.sh                    # or BUILD_ONLY=1 ./deploy.sh to stop after the image
```

It builds the host, builds the image, pushes `ghcr.io/holistics/anfra-library:sha-<UTC minute>` with skopeo
(the token needs `repo` + `write:packages`; the policy file and build outputs go in a `/tmp` dir), then
`proto deploy --image … --port 8080 --name anfra-library --yes`.

Platform facts:

- The deployment is PR #144 (`preview/anfra-library`) on `holistics/prototypes-deploy`. Keep it open;
  do not merge or close it. `proto status anfra-library`, `proto logs anfra-library`.
- Public, no password gate for image deploys. The data is synthetic sales plus public book metadata.
- The PR's `values.yaml` (hand-edited, kept across redeploys) targets port 8080 and mounts an `emptyDir`
  at `/tmp`; the root filesystem may be read-only. Memory limit 1 GiB; anfra + sidecars use ~480 MB, node ~100 MB.
- A fresh image can answer 503 for a minute or two while the pod starts.

## Three gotchas from the first deploy

| Symptom | Cause | Fix |
|---|---|---|
| Pod never ready | A nix image has no `/etc/passwd`, `/etc/group`, `nsswitch.conf`; anfra's OS-user lookup and the DuckDB sidecar need them. | `dockerTools.fakeNss` in `contents`, plus `/etc/hosts` and `/etc/localtime`. |
| `anfra-node is not responding … /tmp/anfra-1.sock` | Nothing writable for the sidecar sockets, the runtime file and DuckDB's WAL. | `emptyDir` at `/tmp`; the Data Folder is copied there at start. |
| "No Data Apps yet" | `cp -r` kept nix store symlinks; anfra's app scanner skips symlinked files. | `cp -rL`. |

The sidecars are dynamically linked against glibc: the image adds the `/lib64/ld-linux-x86-64.so.2` symlink
and `LD_LIBRARY_PATH` with gcc's lib and glibc.

## Notes

- `anfra-src` is `github:holistics/anfra/v0.11.1` (a private repo: nix needs GitHub credentials to fetch it);
  its narHash equals the local checkout's tag.
- GHCR sometimes answers a mid-push token request with 403; `deploy.sh` retries the copy.
