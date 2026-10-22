{
  description = "Library Data App + its cut-down anfra host: dev shell, anfra built from source, proto, one container image";

  # Everything the repo needs comes from here: on a machine with only nix (flakes enabled), `nix develop` gives
  # node 22, pnpm, gh, skopeo, proto, anfra, duckdb, proot …, and `nix build .#image` builds the container from the
  # flake's own source (app/ and host/ are built inside nix, no impure inputs).
  #
  # Private sources, fetched with *your* credentials (see README.md "Prerequisites"):
  #   anfra-src   github:holistics/anfra           nix's GitHub fetcher: `access-tokens = github.com=<token>` in nix.conf
  #   proto-src   holistics/prototypes-deploy      git over https: your git credential helper (e.g. `gh auth setup-git`)
  #   sidecars    release assets of holistics/holistics-core and holistics/canal: nix cannot download private release
  #               assets, so they are fixed-output `requireFile`s pinned by sha256; `nix run .#fetch-sidecars` downloads
  #               them once with gh (your gh login) and adds them to the store.
  inputs = {
    # nixos-unstable is the first channel with go_1_27 (1.27.2 == anfra's go.mod toolchain line).
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    # anfra's source at the v0.11.1 tag (private).
    anfra-src = {
      url = "github:holistics/anfra/v0.11.1";
      flake = false;
    };
    # The prototypes platform's CLI (private; branch k8s is its default). Pinned rev; `?ref=` names the branch.
    proto-src = {
      url = "git+https://github.com/holistics/prototypes-deploy?ref=k8s&rev=b309b231ceca72f622a68c66fd1ca990cc722edc";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, flake-utils, anfra-src, proto-src }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ] (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          # requireFile marks its outputs unfree: allow the sidecar assets, nothing else.
          config.allowUnfreePredicate = p: lib.hasPrefix "anfra-node-" (lib.getName p) || lib.hasPrefix "canal-query-" (lib.getName p);
        };
        lib = nixpkgs.lib;
        go = pkgs.go_1_27;
        nodejs = pkgs.nodejs_22;
        # anfra's own web build is pinned to pnpm 10 (its lockfile + the deps hash below); app/ and host/ use pnpm 11
        # (host/package.json's packageManager).
        pnpm10 = pkgs.pnpm_10.override { nodejs-slim = pkgs.nodejs-slim_22; };
        pnpm = pkgs.pnpm_11.override { nodejs-slim = pkgs.nodejs-slim_22; };

        manifest = builtins.readFile "${anfra-src}/manifest.yml";
        baseVersion = builtins.head (builtins.match ".*\nversion: *([0-9.]+).*" manifest);
        shortRev = anfra-src.shortRev or "dirty";
        version = "${baseVersion}+${shortRev}";

        # ---- anfra v0.11.1 from source -------------------------------------------------------------------------
        # anfra's frontend (web/sdk + web/appserve), embedded via internal/appserve/dist.
        anfra-web = pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
          pname = "anfra-web";
          inherit version;
          src = anfra-src;
          nativeBuildInputs = [ nodejs pnpm10 pkgs.pnpmConfigHook ];
          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname version src;
            pnpm = pnpm10;
            fetcherVersion = 4;
            hash = "sha256-NuJhfcuMgAWBarCB2zcHb29dwlw+J1WAjfUNZ4pkrAE=";
          };
          env.HUSKY = "0"; # husky's `prepare` wants a git dir
          buildPhase = ''
            runHook preBuild
            pnpm build:web
            runHook postBuild
          '';
          installPhase = ''
            runHook preInstall
            cp -r internal/appserve/dist $out
            runHook postInstall
          '';
        });

        anfra = (pkgs.buildGoModule.override { inherit go; }) {
          pname = "anfra";
          inherit version;
          src = anfra-src;
          vendorHash = "sha256-w5WByspkOuaMhZDE1BIpQ9LVVng/q7HXsP5F6+LKZFA=";
          subPackages = [ "cmd/anfra" ];
          env.CGO_ENABLED = "0";
          # A nix build has no .git: set the whole version (keeps the "+", so anfra treats it as a source build).
          ldflags = [ "-s" "-w" "-X github.com/holistics/anfra/internal/meta.Version=${version}" ];
          preBuild = ''
            rm -rf internal/appserve/dist
            cp -r ${anfra-web} internal/appserve/dist
            chmod -R u+w internal/appserve/dist
          '';
          doCheck = false; # tests need sidecars / a warehouse
          meta = {
            description = "anfra: semantic layer + Data Apps runtime (no sidecars embedded; set ANFRA_NODE_BIN / ANFRA_CANAL_QUERY_BIN)";
            homepage = "https://github.com/holistics/anfra";
            license = lib.licenses.asl20;
            mainProgram = "anfra";
          };
        };

        # ---- the sidecars anfra v0.11.1's manifest.yml pins ---------------------------------------------------------
        # anfra-node-v0.8.0 (holistics/holistics-core) and query-v2.19.1 (holistics/canal): release assets of private
        # repos, which no nix fetcher can download. Pinned by the sha256 GitHub reports for each asset; fixed-output
        # paths that `nix run .#fetch-sidecars` fills (gh release download, checked, nix-store --add-fixed).
        sidecarTarget = {
          x86_64-linux = "linux-x64"; aarch64-linux = "linux-arm64";
          x86_64-darwin = "darwin-x64"; aarch64-darwin = "darwin-arm64";
        }.${system};
        sidecarReleases = {
          anfra-node = {
            repo = "holistics/holistics-core"; tag = "anfra-node-v0.8.0";
            sha256 = {
              linux-x64 = "08a33dbee22e97c3a42683454bc95f046215c0b377cb8cd2d0a86e5dd7f4c95d";
              linux-arm64 = "3681c10d85ee89b277f868c2687d7b03011d6ee3c1283fa99efedb114112d8ec";
              darwin-x64 = "2a97986aa72220edada249455a443237e52f42449741a0ea96f4f808437d1e09";
              darwin-arm64 = "c7c5bdc47ca215c0bc5a4cd7317cfc8524d00fa08ea7b0f08dbcdd725052059d";
            };
          };
          canal-query = {
            repo = "holistics/canal"; tag = "query-v2.19.1";
            sha256 = {
              linux-x64 = "060b02fecf25f21c5a373d2244712cc1b46b70e6b1b3a87ba62e847c7e535cea";
              linux-arm64 = "ac4340e74251782cbb016fed8d84fc1d3b6885647f7f6b54230314d4664f79fa";
              darwin-x64 = "d0d18226b20a26d8122fca291e0a27e6fe533adfd44399bbcf3fa88e42e6b410";
              darwin-arm64 = "70f02bd06c76a1be7df86a4d530d9f8814b7b6720d66f9227cc361c1ee642c77";
            };
          };
        };
        sidecarAsset = name: r: rec {
          asset = "${name}-${sidecarTarget}";
          inherit (r) repo tag;
          sha256 = r.sha256.${sidecarTarget};
          file = pkgs.requireFile {
            name = asset;
            inherit sha256;
            message = ''
              ${asset} (${repo} release ${tag}) is a private release asset nix cannot download.
              Add it to the store once, with your gh login (needs read access to ${repo}):
                nix run .#fetch-sidecars
            '';
          };
        };
        sidecarAssets = lib.mapAttrs sidecarAsset sidecarReleases;
        sidecars = pkgs.runCommand "anfra-sidecars" {} ''
          mkdir -p $out/bin
          install -m755 ${sidecarAssets.anfra-node.file} $out/bin/anfra-node
          install -m755 ${sidecarAssets.canal-query.file} $out/bin/canal-query
        '';
        # Store paths without a build dependency: the dev shell must open before the sidecars are fetched.
        storePathOf = drv: builtins.unsafeDiscardStringContext drv.outPath;

        fetch-sidecars = pkgs.writeShellApplication {
          name = "fetch-sidecars";
          runtimeInputs = [ pkgs.gh pkgs.coreutils ];
          text = ''
            # Adds the pinned sidecar release assets to the nix store. With a folder argument (e.g. an anfra checkout's
            # .sidecars/ holding anfra-node and canal-query), takes them from there instead of downloading.
            from=''${1:-}
            tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
            ${lib.concatMapStrings (name: let s = sidecarAssets.${name}; in ''
              if [ -e ${storePathOf s.file} ]; then
                echo "${s.asset}: already in the store"
              else
                if [ -n "$from" ]; then cp "$from/${name}" "$tmp/${s.asset}"
                else
                  echo "downloading ${s.asset} from ${s.repo} ${s.tag} (gh)"
                  gh release download -R ${s.repo} ${s.tag} -p ${s.asset} -D "$tmp" \
                    || { echo "could not download ${s.asset}: is gh logged in (gh auth login) as an account that can read ${s.repo}?" >&2; exit 1; }
                fi
                echo "${s.sha256}  $tmp/${s.asset}" | sha256sum -c --quiet - \
                  || { echo "${s.asset}: sha256 differs from the pin" >&2; exit 1; }
                nix-store --add-fixed sha256 "$tmp/${s.asset}"
              fi
            '') (lib.attrNames sidecarAssets)}
            # The executable pair (packages.sidecars), kept from garbage collection by ./result-sidecars (git-ignored).
            root=$PWD/result-sidecars
            nix build --out-link "$root" '${builtins.unsafeDiscardOutputDependency sidecars.drvPath}^out'
            echo "sidecars: $(readlink "$root")"
          '';
        };

        # ---- proto: the prototypes platform's CLI -------------------------------------------------------------------
        proto = (pkgs.buildGoModule.override { go = pkgs.go_1_26; }) {
          pname = "proto";
          version = "0-unstable-${proto-src.shortRev}";
          src = proto-src;
          sourceRoot = "source/cli"; # flake = false inputs unpack as "source"
          vendorHash = "sha256-ONCw8n5rhg7roqk0WLA0ZKwD1HMySK9lT2ERH/cILnQ=";
          env.CGO_ENABLED = "0";
          ldflags = [ "-s" "-w" ];
          doCheck = false;
          postInstall = ''
            [ -e $out/bin/cli ] && mv $out/bin/cli $out/bin/proto || true
          '';
          meta = {
            description = "proto: deploy prototypes to the Holistics prototypes platform";
            homepage = "https://github.com/holistics/prototypes-deploy";
            mainProgram = "proto";
          };
        };

        # ---- the Data App and the host, built from this flake's source ------------------------------------------------
        # app/: tsc must pass, then build.mjs bundles src/ into apps/library.html (esbuild from nixpkgs).
        library-app = pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
          pname = "library-app";
          version = "0"; # fixed: the pnpm deps don't refetch on every commit
          src = ./app;
          nativeBuildInputs = [ nodejs pnpm pkgs.pnpmConfigHook pkgs.esbuild pkgs.typescript ];
          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname version src;
            inherit pnpm;
            fetcherVersion = 4;
            hash = "sha256-nb45yNIXGv0x+8+Ja8FovfCSwmj73k0cXqQ7T+GfIU8=";
          };
          buildPhase = ''
            runHook preBuild
            tsc -p .
            node build.mjs
            runHook postBuild
          '';
          # The Data Folder as the image serves it: no sources, build files or raw data; its own data source file.
          installPhase = ''
            runHook preInstall
            mkdir -p $out
            cp -r models datasets apps $out/
            mkdir -p $out/data $out/.anfra
            cp data/library.duckdb $out/data/
            cp .anfra/context_sources.yml $out/.anfra/
            cat > $out/.anfra/data_sources.yml <<'YML'
            data_sources:
              library:
                type: duckdb
                connection:
                  path: /tmp/lib/data/library.duckdb
            YML
            runHook postInstall
          '';
        });

        # host/: vite build + tsc, then only what `node dist/server/main.js` needs (production node_modules).
        host = pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
          pname = "library-host";
          version = "0"; # fixed: the pnpm deps don't refetch on every commit
          src = lib.cleanSourceWith {
            src = ./host;
            filter = path: type: !(builtins.elem (baseNameOf path) [ "node_modules" "dist" ]);
          };
          nativeBuildInputs = [ nodejs pnpm pkgs.pnpmConfigHook ];
          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname version src;
            inherit pnpm;
            fetcherVersion = 4;
            hash = "sha256-KOJuu7J+JkE4PrBuZLB+jFk3RH029ttKu36YgZTYCQw=";
          };
          buildPhase = ''
            runHook preBuild
            pnpm build
            runHook postBuild
          '';
          installPhase = ''
            runHook preInstall
            mkdir -p $out
            cp -r dist package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc $out/
            (cd $out && CI=1 pnpm install --prod --offline --frozen-lockfile --ignore-scripts)
            rm -f $out/pnpm-lock.yaml $out/pnpm-workspace.yaml $out/.npmrc
            runHook postInstall
          '';
          dontFixup = true; # node_modules: nothing to patch or strip
        });

        siteUrl = "https://anfra-library.pages.holistics.dev";

        # ---- the container for the prototypes platform (linux/amd64) ------------------------------------------------
        image = let
          files = pkgs.runCommand "library-files" {} ''
            mkdir -p $out/srv && cp -r ${library-app} $out/srv/library && chmod -R u+w $out/srv/library
            mkdir -p $out/srv/host && cp -r ${host}/. $out/srv/host/
            mkdir -p $out/opt/anfra && cp ${sidecars}/bin/anfra-node ${sidecars}/bin/canal-query $out/opt/anfra/ && chmod 755 $out/opt/anfra/*
            mkdir -p $out/lib64 && ln -s ${pkgs.glibc}/lib/ld-linux-x86-64.so.2 $out/lib64/ld-linux-x86-64.so.2
            mkdir -p $out/tmp && chmod 1777 $out/tmp
            mkdir -p $out/etc && printf '127.0.0.1 localhost\n::1 localhost\n' > $out/etc/hosts && printf 'UTC\n' > $out/etc/timezone \
              && ln -s ${pkgs.tzdata}/share/zoneinfo/Etc/UTC $out/etc/localtime
          '';
          # The pod's root filesystem may be read-only; /tmp is an emptyDir (values.yaml in the PR). The Data Folder is
          # copied there (-L: the app scanner skips symlinked files) so anfra's runtime file, the sidecar sockets and
          # DuckDB's WAL land on writable storage. anfra listens on loopback only (it has no auth); the host is public.
          start = pkgs.writeShellScript "start" ''
            set -u
            # Ports are fixed on the platform; overridable only so the image can be smoke-tested next to other servers.
            AP=''${ANFRA_PORT:-7878} HP=''${PORT:-8080}
            # The image layer is read-only; anfra needs a writable repo for its runtime file, the sidecar sockets and DuckDB's WAL.
            rm -rf /tmp/lib && cp -rL /srv/library /tmp/lib && chmod -R u+w /tmp/lib && cd /tmp/lib || exit 1
            anfra serve --no-apps --no-watch --no-mcp --addr 127.0.0.1:$AP &
            # The host is the container's main process: it answers /health with 503 until anfra is up, so the platform's
            # readiness probe does the waiting, and a dead anfra shows as a failing health check.
            cd /srv/host
            NODE_ENV=production ANFRA_REPO=/tmp/lib ANFRA_URL=http://127.0.0.1:$AP PORT=$HP HOSTNAME=0.0.0.0 TRUST_PROXY=1 \
              exec node dist/server/main.js
          '';
        in pkgs.dockerTools.buildLayeredImage {
          name = "ghcr.io/holistics/anfra-library";
          tag = "latest";
          # fakeNss: /etc/passwd, /etc/group and nsswitch.conf, which anfra's OS-user lookup and the DuckDB sidecar need.
          contents = [ files anfra nodejs pkgs.dockerTools.fakeNss pkgs.bashInteractive pkgs.coreutils pkgs.cacert pkgs.tzdata
                       pkgs.stdenv.cc.cc.lib pkgs.glibc ];
          config = {
            Env = [
              "ANFRA_NODE_BIN=/opt/anfra/anfra-node"
              "ANFRA_CANAL_QUERY_BIN=/opt/anfra/canal-query"
              "ANFRA_SITE_URL=${siteUrl}"
              "LD_LIBRARY_PATH=${pkgs.stdenv.cc.cc.lib}/lib:${pkgs.glibc}/lib"
              "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
              "TZ=Etc/UTC"
              "HOME=/tmp"
              "PATH=/bin:${anfra}/bin:${nodejs}/bin"
            ];
            WorkingDir = "/tmp";
            ExposedPorts = { "8080/tcp" = {}; };
            Cmd = [ "${start}" ];
          };
        };
      in {
        packages = {
          inherit anfra anfra-web proto sidecars fetch-sidecars library-app host;
          default = anfra;
        } // lib.optionalAttrs (system == "x86_64-linux") {
          # The platform runs linux/amd64 only.
          inherit image;
        };

        apps.fetch-sidecars = { type = "app"; program = lib.getExe fetch-sidecars; meta.description = "Add the pinned sidecar releases to the nix store (gh)"; };

        # `nix flake check`: the app's typecheck + build (tsc runs in library-app's build).
        checks = { inherit library-app; };

        devShells.default = pkgs.mkShell {
          packages = [ nodejs pnpm pkgs.typescript pkgs.esbuild pkgs.duckdb anfra proto fetch-sidecars
                       pkgs.gh pkgs.git pkgs.skopeo pkgs.curl pkgs.jq pkgs.gnutar pkgs.gzip
                       pkgs.coreutils pkgs.findutils pkgs.gnused pkgs.gnugrep pkgs.procps pkgs.bashInteractive ]
                     ++ lib.optional pkgs.stdenv.hostPlatform.isLinux pkgs.proot; # smoke.sh
          shellHook = ''
            export ANFRA_LIBRARY_SHELL=1
            # pnpm 11 matches host/package.json's packageManager: no self-switching.
            export npm_config_manage_package_manager_versions=false
            # A source-built anfra embeds no sidecars: point it at the pinned releases in the store (fetch-sidecars).
            if [ -x ${storePathOf sidecars}/bin/anfra-node ]; then
              export ANFRA_NODE_BIN=''${ANFRA_NODE_BIN:-${storePathOf sidecars}/bin/anfra-node}
              export ANFRA_CANAL_QUERY_BIN=''${ANFRA_CANAL_QUERY_BIN:-${storePathOf sidecars}/bin/canal-query}
            else
              echo "note: the pinned sidecars are not in the nix store yet: run 'fetch-sidecars' (gh auth with read access to holistics/holistics-core and holistics/canal)" >&2
            fi
          '';
        };

        formatter = pkgs.nixfmt;
      });
}
