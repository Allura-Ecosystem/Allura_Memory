# Beta 2 development setup

Use the current `beta-v2` checkout for Beta 2. The older checkout and installed
`allura-dev` convenience command described in the historical section below are
separate targets; this setup does not redirect or redeploy them.

The foundation pins Bun **1.3.14**, Node **24.19.0**, and `foundation/bun.lock`.
Use the repository launcher instead of the shell's default Node/Bun:

```sh
sh foundation/scripts/with-toolchain.sh
sh foundation/scripts/with-toolchain.sh bun run install:frozen
sh foundation/scripts/with-toolchain.sh bun run typecheck
sh foundation/scripts/with-toolchain.sh bun run lint
sh foundation/scripts/with-toolchain.sh bun run test
sh foundation/scripts/with-toolchain.sh bun run test:db
```

The launcher changes to `foundation`, verifies the declared executables and
forwards arguments without shell evaluation. PATH changes affect only that
process; no global Node replacement or shell-startup edit is needed. Default
Linux tool locations, relative to `${XDG_DATA_HOME:-$HOME/.local/share}`:

- `allura-toolchain/bun-linux-x64-baseline/bun`
- `allura-toolchain/node-v24.19.0-linux-x64/bin/node`

Set `ALLURA_TOOLCHAIN_ROOT` to another existing parent if necessary. Missing or
wrong tools fail before the requested command. This launcher does not install
tools implicitly or claim other-platform support.

Local integration prerequisites are a working Docker daemon, package-pinned
Playwright Chromium/headless runtime and OS libraries, and isolated Linux Secret
Service tools: D-Bus, GNOME Keyring, `secret-tool`, GLib tools and util-linux.
Exercise a real browser launch, not just a browser-cache directory check.
Database tests own fresh disposable loopback containers; never substitute a
production database URL or remove unrelated containers.

Prepare the declared public local embedding model explicitly, without model
credentials; preparation can download public files, application inference cannot:

```sh
env -u HF_TOKEN -u HF_ACCESS_TOKEN sh foundation/scripts/with-toolchain.sh bun scripts/prepare-model.ts
```

Then verify local-only inference in a fresh process. Do not add a paid provider
or copy application secrets to make readiness checks pass.

Exact-revision CI requires a clean committed source checkout and evidence outside
source. Use a separately owned clean validation worktree if private/local plans
or preserved unfinished work remain in the authoring checkout:

```sh
sh foundation/scripts/with-toolchain.sh bun scripts/ci.ts "$(git rev-parse HEAD)"
```

GitHub Actions covers `main`, `beta`, and `beta-v2`, with pinned tools and read-only
repository permissions. A push runs checks, not deployment. Verify the actual
hosted run before saying CI passed. Never weaken registered cases, assertions,
source pins or fixed verification budgets. Native/model/browser prerequisite
probes are not a completed Beta 2 user journey or product acceptance.

Stage only reviewed setup paths. Private plans, evidence archives, credentials,
model caches and unfinished code must not be swept into a public commit.

## Historical local-development target — preserved reference

# Local development on Sabir's Dell

Start in `/home/sabira/homelab/START-HERE.md` or open Desktop → Homelab.

## Correct checkout and commands

Active development is `/home/sabira/Allura_Memory-beta-local`, branch `local/beta-machine-only` at cleanup. `Allura_Memory` is the primary reference checkout and owns shared Git metadata. `Allura_Memory-main` is the separate legacy local stack. Do not merge their unrelated migration histories or delete a linked worktree as a duplicate.

```sh
allura-dev --where
allura-dev run check
allura-dev run test:db
allura-dev run check:all
```

`--where` must print `/home/sabira/Allura_Memory-beta-local/foundation`. The installed command uses pinned Bun 1.3.14 and Node 24.19.0, reports the target branch, and refuses missing targets/tools and unknown commands. It is a checks-only convenience command, not an arbitrary Bun shell, server starter or deployment command. Run other explicitly authorized development commands directly in the checkout with the pinned toolchain.

`check` runs the strict non-DB test inventory, both TypeScript projects, and ESLint. `test:db` runs the strict PostgreSQL/browser/package lane in its own disposable container and removes that fixture. Keep Docker Desktop available in context `desktop-linux`. The test harness never falls back to a production database URL. `check:all` runs both. Do not weaken case/assertion discovery to obtain a green result.

## Source, data and runtime

- Current schema source: `foundation/migrations/001-*.sql` through `020-embedding-providers.sql`, ordered and checksum-bound by `foundation/src/persistence.ts`.
- Contracts: `_bmad-output/planning-artifacts/contracts/persistence-v1.md` and related current contracts. Historical dictionaries do not override the current schema.
- Packaged beta runtime: `/home/sabira/.local/share/allura-beta/releases/ram-0d69d8f9f9c1`; user service `allura-beta.service`; loopback port 6488.
- Current beta data: Docker volume `allura-beta-data`, separate from source. Never run broad volume pruning or restore over it as cleanup.
- Legacy schema: `Allura_Memory-main/docker/postgres-init/`. Its `71-mcp-authentication-lookup.sql` is not beta migration 021. Legacy data and Jeeves profile remain outside this cleanup's backup/change scope.

A source commit or passing suite does not deploy the packaged service. Human review/login, production acceptance, remote CI and unattended/reboot readiness remain separate gates. No remote push is part of this cleanup.

## Local tooling source and evidence

`tools/homelab/allura-dev` and `tools/homelab/test_allura_dev.py` preserve the Dell-specific installed wrapper and regression checks. The installed command is a separate executable copy at `/home/sabira/.local/bin/allura-dev`; update it only deliberately, not by switching branches. Verify:

```sh
python3 tools/homelab/test_allura_dev.py
cmp tools/homelab/allura-dev /home/sabira/.local/bin/allura-dev
```

Machine-specific reports and archived diagnostic logs live under `/home/sabira/.hermes/profiles/troy/reports/homelab-dev-ready/`, outside source. `_bmad/render/` is regenerable workflow output and ignored; authored `_bmad-output/` specifications remain versioned. No blanket ignore hides source changes.

For project changes, use the current `guidelines/ALLURA-BMAD.md` adapter and installed BMAD workflow. Preserve tenant/workspace/approval boundaries. Local verification is not operational work-status authority or semantic promotion.
