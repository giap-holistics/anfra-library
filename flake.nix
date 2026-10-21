{
  description = "Library Data App + its cut-down anfra host: dev shell, anfra built from source, one container image";

  inputs = {
    # nixos-unstable is the first channel with go_1_27 (1.27.2 == anfra's go.mod toolchain line).
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    # anfra's source at the v0.11.1 tag (a private repo: fetching needs GitHub access, e.g. a
    # `access-tokens = github.com=...` line in nix.conf or `gh auth` credentials). Same narHash as the
    # git+file checkout the competition flake used.
    anfra-src = {
      url = "github:holistics/anfra/v0.11.1";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, flake-utils, anfra-src }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ] (system:
      let
        pkgs = import nixpkgs { inherit system; };
        lib = pkgs.lib;
        go = pkgs.go_1_27;
        nodejs = pkgs.nodejs_22;
        pnpm = pkgs.pnpm_10.override { nodejs-slim = pkgs.nodejs-slim_22; };

        manifest = builtins.readFile "${anfra-src}/manifest.yml";
        baseVersion = builtins.head (builtins.match ".*\nversion: *([0-9.]+).*" manifest);
        shortRev = anfra-src.shortRev or "dirty";
        version = "${baseVersion}+${shortRev}";

        # anfra's frontend (web/sdk + web/appserve), embedded via internal/appserve/dist.
        anfra-web = pkgs.stdenvNoCC.mkDerivation (finalAttrs: {
          pname = "anfra-web";
          inherit version;
          src = anfra-src;
          nativeBuildInputs = [ nodejs pnpm pkgs.pnpmConfigHook ];
          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname version src;
            inherit pnpm;
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

        siteUrl = "https://anfra-library.pages.holistics.dev";
      in {
        packages = {
          inherit anfra anfra-web;
          default = anfra;
        };

        # The container for the prototypes platform (linux/amd64). Three impure inputs, all absolute paths:
        #   ANFRA_SIDECARS  folder with anfra-node (v0.8.0) and canal-query (2.19.1): `make sidecars` in an anfra checkout
        #   LIBRARY_REPO    the Data Folder, ./app
        #   HOST_PROD       the host built for production with production node_modules (deploy.sh stages it in ./build/host)
        # Build: nix build --impure .#image  (deploy.sh does all of it)
        image = let
          env = name: let v = builtins.getEnv name; in
            if v == "" then throw "image: set ${name} (an absolute path) and build with --impure" else /. + v;
          sidecars = env "ANFRA_SIDECARS";
          repo = lib.cleanSourceWith {
            src = env "LIBRARY_REPO";
            filter = path: type: let b = baseNameOf path; in
              !(builtins.elem b [ "node_modules" "src" "shots" "raw" "books.csv" "sales.csv" "library.new.duckdb"
                                  "package.json" "pnpm-lock.yaml" "tsconfig.json" "build.mjs" "data_sources.yml" ])
              && !(lib.hasSuffix ".log" b) && !(lib.hasSuffix ".wal" b);
          };
          hostProd = builtins.path { path = env "HOST_PROD"; name = "host-prod"; };
          files = pkgs.runCommand "library-files" {} ''
            mkdir -p $out/srv && cp -r ${repo} $out/srv/library && chmod -R u+w $out/srv/library
            mkdir -p $out/srv/library/.anfra
            cat > $out/srv/library/.anfra/data_sources.yml <<'YML'
            data_sources:
              library:
                type: duckdb
                connection:
                  path: /tmp/lib/data/library.duckdb
            YML
            mkdir -p $out/srv/host && cp -r ${hostProd}/dist ${hostProd}/node_modules ${hostProd}/package.json $out/srv/host/
            mkdir -p $out/opt/anfra && cp ${sidecars}/anfra-node ${sidecars}/canal-query $out/opt/anfra/ && chmod 755 $out/opt/anfra/*
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
            rm -rf /tmp/lib && cp -rL /srv/library /tmp/lib && chmod -R u+w /tmp/lib && cd /tmp/lib || exit 1
            anfra serve --no-apps --no-watch --no-mcp --addr 127.0.0.1:$AP &
            A=$!
            trap 'kill $A ''${H:-} 2>/dev/null; exit 0' TERM INT
            up() { node -e "fetch('http://127.0.0.1:$AP/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"; }
            for i in $(seq 1 240); do
              up && break
              kill -0 $A 2>/dev/null || { echo "anfra exited before it was healthy" >&2; exit 1; }
              sleep 0.5
            done
            up || { echo "anfra not healthy after 120 s" >&2; exit 1; }
            echo "anfra healthy; starting the host on :$HP"
            cd /srv/host
            NODE_ENV=production ANFRA_REPO=/tmp/lib ANFRA_URL=http://127.0.0.1:$AP PORT=$HP HOSTNAME=0.0.0.0 TRUST_PROXY=1 \
              node dist/server/main.js &
            H=$!
            # Whichever process exits first takes the container down, so the platform restarts it.
            wait -n $A $H; s=$?
            echo "a process exited ($s); stopping" >&2
            kill $A $H 2>/dev/null
            exit $(( s == 0 ? 1 : s ))
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

        devShells.default = pkgs.mkShell {
          packages = [ go nodejs pnpm pkgs.typescript pkgs.esbuild pkgs.duckdb pkgs.ffmpeg pkgs.skopeo
                       pkgs.jq pkgs.curl pkgs.git pkgs.gh ];
          shellHook = ''
            export GOTOOLCHAIN=local
            # host/package.json pins pnpm 11; nixpkgs ships pnpm 10: don't let pnpm try to self-switch.
            export COREPACK_ENABLE_STRICT=0
            export npm_config_manage_package_manager_versions=false
            # A source-built anfra embeds no sidecars: point it at the pinned releases `make sidecars` downloads.
            export ANFRA_SIDECARS=''${ANFRA_SIDECARS:-$HOME/Dev/anfra/.sidecars}
            if [ -x "$ANFRA_SIDECARS/anfra-node" ]; then
              export ANFRA_NODE_BIN=''${ANFRA_NODE_BIN:-$ANFRA_SIDECARS/anfra-node}
              export ANFRA_CANAL_QUERY_BIN=''${ANFRA_CANAL_QUERY_BIN:-$ANFRA_SIDECARS/canal-query}
            else
              echo "note: no sidecars in $ANFRA_SIDECARS: run 'make sidecars' in an anfra checkout (needs gh auth)"
            fi
            echo "anfra-library shell: node $(node --version), pnpm $(pnpm --version), duckdb $(duckdb --version | cut -d' ' -f1)"
          '';
        };

        formatter = pkgs.nixfmt-rfc-style;
      });
}
