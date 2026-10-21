#!/usr/bin/env bash
# Build the Library + host image and deploy it to the prototypes platform.
#   1. builds the app (pnpm check + build → app/apps/library.html), builds the host for production, and stages it with production node_modules in a temp dir
#   2. nix builds the image (anfra v0.11.1 from source + pinned sidecars + app/ + the staged host + node 22), linux/amd64
#   3. skopeo pushes it to ghcr.io/holistics/<name>:<tag> (a classic GitHub token with repo + write:packages)
#   4. proto deploy --image updates the preview PR; the site is https://<name>.pages.holistics.dev
# Usage: ./deploy.sh [name]          default name: anfra-library
#        BUILD_ONLY=1 ./deploy.sh    stop after step 2 (prints where result-image is)
# Needs: PROTO_GITHUB_TOKEN (or PROTO_GH_TOKEN, e.g. from a .env), ANFRA_SIDECARS (default ~/Dev/anfra/.sidecars).
set -euo pipefail
NAME=${1:-anfra-library}
ROOT=$(cd "$(dirname "$0")" && pwd)
SIDECARS=${ANFRA_SIDECARS:-$HOME/Dev/anfra/.sidecars}
TAG=sha-$(date -u +%Y%m%d%H%M)
IMG=ghcr.io/holistics/$NAME:$TAG
# Build outputs, the skopeo policy and skopeo's blob cache live in a temp dir, not in the repo.
WORK=${WORK:-$(mktemp -d /tmp/anfra-library-deploy.XXXXXX)}
shell() { nix develop "$ROOT" -c bash -c "$1"; }

echo "== build the app (apps/library.html is build output; tsc must pass)"
shell "set -e; cd '$ROOT/app'; CI=1 pnpm install --frozen-lockfile; pnpm check; pnpm build"

echo "== build the host"
shell "set -e; cd '$ROOT/host'; CI=1 pnpm install --frozen-lockfile; pnpm build
  P='$WORK/host'; rm -rf \"\$P\"; mkdir -p \"\$P\"
  cp -r dist package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc \"\$P/\"
  cd \"\$P\" && CI=1 pnpm install --prod --frozen-lockfile --ignore-scripts"

echo "== build the image"
ANFRA_SIDECARS=$SIDECARS LIBRARY_REPO=$ROOT/app HOST_PROD=$WORK/host \
  nix build --impure "$ROOT#image.x86_64-linux" -o "$WORK/result-image"
[ -n "${BUILD_ONLY:-}" ] && { echo "image: $WORK/result-image"; exit 0; }

TOKEN=${PROTO_GITHUB_TOKEN:-${PROTO_GH_TOKEN:-$(gh auth token)}}
export PROTO_GITHUB_TOKEN=$TOKEN
USER_LOGIN=$(GH_TOKEN=$TOKEN gh api user -q .login)
echo "== push $IMG as $USER_LOGIN"
POLICY=$WORK/skopeo-policy.json; printf '{"default":[{"type":"insecureAcceptAnything"}]}' > "$POLICY"
# skopeo's own GHCR login (--dest-creds) fails here: it re-requests a bearer token for every blob, and GHCR
# answers with 403 partway through ("trying to reuse blob … 403 Forbidden"), on every try. A registry token
# fetched once and passed with --dest-registry-token works.
REG_TOKEN=$(printf 'user = "%s:%s"\n' "$USER_LOGIN" "$TOKEN" | curl -sfK- \
  "https://ghcr.io/token?service=ghcr.io&scope=repository:holistics/$NAME:pull,push" | python3 -c 'import json,sys;print(json.load(sys.stdin)["token"])')
export REG_TOKEN
for try in 1 2 3; do
  shell "skopeo copy --retry-times 3 --policy '$POLICY' --dest-registry-token \"\$REG_TOKEN\" 'docker-archive:$WORK/result-image' 'docker://$IMG'" && break
  [ "$try" = 3 ] && { echo "push failed 3 times" >&2; exit 1; }
  echo "push failed (try $try); retrying in 10 s" >&2; sleep 10
done

echo "== proto deploy"
~/.local/bin/proto deploy --image "$IMG" --port 8080 --name "$NAME" --yes
echo "deployed $IMG (build dir: $WORK)"
