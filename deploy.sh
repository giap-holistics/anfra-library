#!/usr/bin/env bash
# Build the Library + host image and deploy it to the prototypes platform. Every tool comes from this repo's flake:
# run it from anywhere with only nix installed; it re-runs itself inside `nix develop` when it is not already there.
#   1. nix build .#image: anfra v0.11.1 from source + the pinned sidecars + app/ (tsc, then the bundle) + host/ (built
#      for production) + node 22, linux/amd64. No impure inputs.
#   2. skopeo pushes it to ghcr.io/holistics/<name>:<tag>.
#   3. proto deploy --image updates the preview PR; the site is https://<name>.pages.holistics.dev
# Usage: ./deploy.sh [name]          default name: anfra-library
#        BUILD_ONLY=1 ./deploy.sh    stop after step 1 (prints where the image is)
# Needs: PROTO_GITHUB_TOKEN, a classic GitHub token with repo + write:packages, from the environment or from a .env at
#        the repo root (git-ignored; a line PROTO_GITHUB_TOKEN=ghp_...). The sidecars in the nix store (fetch-sidecars).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")" && pwd)
[ -n "${ANFRA_LIBRARY_SHELL:-}" ] || exec nix develop "$ROOT" -c "$0" "$@"

NAME=${1:-anfra-library}
TAG=sha-$(date -u +%Y%m%d%H%M)
IMG=ghcr.io/holistics/$NAME:$TAG
# The image out-link, the skopeo policy and skopeo's blob cache live in a temp dir, not in the repo.
WORK=${WORK:-$(mktemp -d "${TMPDIR:-/tmp}/anfra-library-deploy.XXXXXX")}

echo "== build the image (app, host, anfra, sidecars: all from the flake)"
nix build "$ROOT#image" -o "$WORK/result-image" || {
  echo "image build failed. If it names a missing anfra-node-* / canal-query-* asset, run: nix run $ROOT#fetch-sidecars" >&2; exit 1; }
[ -n "${BUILD_ONLY:-}" ] && { echo "image: $WORK/result-image"; exit 0; }

if [ -z "${PROTO_GITHUB_TOKEN:-}" ] && [ -f "$ROOT/.env" ]; then
  PROTO_GITHUB_TOKEN=$(sed -n 's/^ *\(export \)\{0,1\}PROTO_GITHUB_TOKEN *= *["'\'']\{0,1\}\([^"'\'' ]*\).*/\2/p' "$ROOT/.env" | tail -n 1)
fi
[ -n "${PROTO_GITHUB_TOKEN:-}" ] || {
  echo "no GitHub token: set PROTO_GITHUB_TOKEN, or put PROTO_GITHUB_TOKEN=<classic token with repo + write:packages> in $ROOT/.env" >&2; exit 1; }
export PROTO_GITHUB_TOKEN
USER_LOGIN=$(GH_TOKEN=$PROTO_GITHUB_TOKEN gh api user -q .login) || { echo "GitHub rejected PROTO_GITHUB_TOKEN" >&2; exit 1; }

echo "== push $IMG as $USER_LOGIN"
POLICY=$WORK/skopeo-policy.json; printf '{"default":[{"type":"insecureAcceptAnything"}]}' > "$POLICY"
# skopeo's own GHCR login (--dest-creds) fails here: it re-requests a bearer token for every blob, and GHCR
# answers with 403 partway through ("trying to reuse blob … 403 Forbidden"), on every try. A registry token
# fetched once and passed with --dest-registry-token works.
REG_TOKEN=$(printf 'user = "%s:%s"\n' "$USER_LOGIN" "$PROTO_GITHUB_TOKEN" | curl -sfK- \
  "https://ghcr.io/token?service=ghcr.io&scope=repository:holistics/$NAME:pull,push" | jq -er .token) \
  || { echo "could not get a GHCR push token (does the token have write:packages?)" >&2; exit 1; }
for try in 1 2 3; do
  skopeo copy --retry-times 3 --policy "$POLICY" --dest-registry-token "$REG_TOKEN" \
    "docker-archive:$WORK/result-image" "docker://$IMG" && break
  [ "$try" = 3 ] && { echo "push failed 3 times" >&2; exit 1; }
  echo "push failed (try $try); retrying in 10 s" >&2; sleep 10
done

echo "== proto deploy"
proto deploy --image "$IMG" --port 8080 --name "$NAME" --yes
echo "deployed $IMG (build dir: $WORK)"
