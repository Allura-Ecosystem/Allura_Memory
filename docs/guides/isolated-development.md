# Isolated development (without touching live Allura)

Use the dedicated linked worktree `/home/roninhub/worktrees/allura-dev`, not the
live checkout or the Epic 30 recovery worktree. No production `.env` files,
credentials, database snapshots, or secrets belong here. The launcher refuses
actual `.env`/`.env.*` files recursively (including local/test/production variants
and symlinks); only names ending `.example` are allowed. It excludes `.git`,
`node_modules`, and `.next` from that scan.

## Start here

On this host, verified local tools live in ignored `artifacts/dev-readiness/bin`:
Bun **1.3.14 baseline x64** (the standard build hit SIGILL) and npm **10.9.4**
(compatibility for existing SDK consumer tests, not project dependency installs).
Nothing replaces the host's global tools. Other machines need the Bun version
pinned by `package.json`, Node >=20, and Docker Compose v2 on the local socket.

```sh
cd /home/roninhub/worktrees/allura-dev
export PATH="$PWD/artifacts/dev-readiness/bin:$PATH"
# Clean the launcher environment too, before Bun can load runtime hooks.
devsafe() { env -i HOME="$HOME" PATH="$PATH" bun --no-env-file scripts/dev-safe/index.ts "$@"; }
devsafe doctor
devsafe install                 # frozen lockfile; lifecycle scripts disabled
devsafe test:launcher           # focused safety regressions, no services
```

Do not use `brain:*`, `portfolio:*`, generic Compose commands, or production
scripts for this lane. Do not copy `.env.portfolio.example` into an actual env
file; the safe values are already built into the launcher.

## Disposable database and dashboard

```sh
devsafe db-up                   # explicit opt-in: builds/starts only dev PostgreSQL
devsafe status                  # only the allura-dev-safe compose project
devsafe dev                     # foreground; Ctrl-C stops this dashboard
# In another terminal with the same function/PATH:
devsafe db-down                 # only dev project; disposable data is lost
```

- PostgreSQL: `127.0.0.1:55432`, database `allura_dev`, owner `allura`, local-only
  password `allura-dev-local-only`. Application role `allura_app` uses the
  existing migration 35 fixture password `change-me-in-production`.
- Dashboard: **http://127.0.0.1:4100**. DevAuth uses only the non-secret identities
  from `.env.portfolio.example` (`dev@allura.local`, `workspace-allura`).
- MCP/Brain URL is reserved at `http://127.0.0.1:6410/mcp`; this launcher does **not**
  start MCP. Unavailable optional integrations are expected, not live fallbacks.
- Compose project/image are `allura-dev-safe` / `allura-dev-safe-postgres:local`.
  The portfolio PostgreSQL Dockerfile supplies existing migrations and fictional
  fixtures. There are no external networks, persistent volumes, or host mounts.
  Data lives on 512 MiB tmpfs; PostgreSQL has a 768 MiB memory, one CPU, and 128 PID
  cap. Stopping/recreating the container loses its data. Never put real data here.
- Production ports `3200`, `5432`, `6477` are not used as host targets. Port 5432
  exists only _inside_ the isolated dev PostgreSQL container.

## Validation and Git readiness

Run these **sequentially**, not alongside each other on this small host:

```sh
devsafe typecheck
devsafe test:unit
devsafe build
```

Unit tests run one worker with no file parallelism. Their environment deliberately
omits `POSTGRES_APP_PASSWORD` and `RUN_E2E_TESTS`, so DB-gated tests remain off;
the local-only MCP token fixture is supplied. Unit tests do not force DevAuth;
individual auth tests select their own mode. Build uses Webpack, a 2 GiB Node heap
limit, bounded native threads, and `CIRCLE_NODE_TOTAL=2`, which the installed
Next configuration translates to one build worker (regression-tested). Build
sets `NODE_ENV=production` and disables DevAuth; a build is not a production
launch. No existing Next/Vitest configuration is changed.

Before calling changes **Git-ready**, review `git diff --check`, inspect the diff,
confirm focused/full checks and dashboard smoke results, and record any baseline
failures explicitly. The launcher does not stage, commit, push, merge, migrate a
live DB, or decide readiness automatically. Keep ignored local tools/evidence out
of Git. See `.opencode/DEVELOPMENT-READINESS.md` for this host's validation record.

## Limits and failure handling

This is an accident-prevention guardrail, **not an OS sandbox**. Only `PATH` and
`HOME` survive from the parent environment; child application/DB/API/Compose
settings are fixed. Those two paths and the repository/dependencies must still
be trusted. Arbitrary repository code can access the host, read home-directory
configuration, or make network requests. Do not expose this fixture-auth server
outside loopback. Never feed it production credentials.

Unknown commands and extra flags fail closed. A dotenv refusal means remove the
file from this worktree safely; do not print its contents or weaken the guard.
A port collision means investigate the owner, never stop a production container.
`doctor` only checks local preconditions and does not claim DB/service health;
`status` queries only the dedicated dev project. `db-down` is deliberately scoped
and does not remove unrelated containers, volumes, networks, or images.
