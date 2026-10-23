# Isolated development

This lane is source-complete but **not approved for service activation yet**. AD-45
requires the dashboard and published PostgreSQL host ports to be chosen and added
to the canonical port registry before either service starts. The launcher has no
port defaults and does not treat a locally free port as approval.

Use a durable linked Git worktree rather than a primary checkout. Do not copy any
production dotenv file, credentials, database snapshot, or secret into it. The
launcher rejects `.env` and `.env.*` names recursively; files ending in
`.example` are the only dotenv-shaped names allowed.

## Source-only checks

From the worktree root, with the Bun version pinned in `package.json`:

```sh
bun --no-env-file run test:dev-safe
bun --no-env-file run typecheck
bun --no-env-file run dev:safe doctor
```

Keep `--no-env-file` on the **outer** Bun invocation. The flags retained inside
the package aliases are defense in depth; an inner runtime cannot remove values
that were already inherited from the caller's ambient environment. The focused
Vitest configuration also disables Vite env-file discovery and starts Bun test
workers with `--no-env-file`.

`doctor` inspects the exact Bun and Docker executables selected by the launcher,
verifies the pinned Bun version, and checks for a Compose plugin through
`docker compose version --short`. It does not query the daemon for projects,
containers, images, networks, volumes, or service status, and it does not start
or stop anything. All launcher commands also require the installed Next.js,
Vitest and TypeScript entry files plus the disposable database build inputs;
install the pinned lockfile with `bun install --frozen-lockfile` first.

The focused tests execute the real launcher against a stub Docker executable.
They do not call the host Docker CLI or daemon.

## Port decision and activation gate

Before activation, update `docs/allura/BLUEPRINT.md` and the applicable canonical
Compose registry under AD-45. After that decision is reviewed, provide both
chosen numeric values explicitly:

- `ALLURA_DEV_SAFE_DASHBOARD_PORT`: approved dashboard host port, outside the
  banned 3000-3999 band.
- `ALLURA_DEV_SAFE_POSTGRES_PORT`: approved disposable PostgreSQL host port,
  outside the banned 3000-3999 band.
- `ALLURA_DEV_SAFE_PORTS_APPROVED=true`: operator acknowledgment that the port
  registry decision has landed. This flag is a fail-closed reminder, not proof
  of governance by itself.

Until then, `dev` and `db-up` refuse to run. No value in this guide is a proposed
or reserved default.

After approval, commands remain fixed and accept no forwarded flags:

```sh
bun --no-env-file run dev:safe doctor
bun --no-env-file run dev:safe db-up
bun --no-env-file run dev:safe status
bun --no-env-file run dev:safe dev
bun --no-env-file run dev:safe typecheck
bun --no-env-file run dev:safe test:launcher
bun --no-env-file run dev:safe test:unit
bun --no-env-file run dev:safe db-down
```

`status`, `db-up`, and `db-down` require the PostgreSQL port variable because the
Compose file deliberately has no fallback. The launcher fixes the Compose
project directory, file, local Docker socket, and `/dev/null` env
file. It never invokes `brain:*`, the root Compose stack, the portfolio stack,
or an MCP service. It derives a stable project name from the linked worktree's
absolute path, so containers, images and networks are not shared with another
dev-safe worktree. The Compose file declares no named or bind-mounted volumes.

`dev` does not start PostgreSQL. It first runs `pg_isready` inside that exact
worktree-scoped Compose service and refuses to launch Next.js unless `db-up`
already completed and the disposable database is accepting connections.

## What is isolated

- The dashboard listener binds to `127.0.0.1` on the approved configured port.
- PostgreSQL publishes only to `127.0.0.1` on the approved configured port. Its
  container port remains the standard internal PostgreSQL port.
- The database container joins a dedicated Compose network marked
  `internal: true`, so the container network has no external route.
- Host loopback binding and container-network isolation are different controls:
  the internal network does not cancel the intentional host-loopback publication.
- Database state uses tmpfs and is lost when the container is removed. Resource
  caps bound memory, CPU, and process count.
- The PostgreSQL build uses the repository root as context because the existing
  Dockerfile copies migrations by root-relative paths. Its Dockerfile-specific
  ignore file sends only `docker/postgres-init/**` and the public portfolio
  workspace fixture; repository state, dotenv files, Git data, build output, and
  local caches stay out of the build context.

## Limits

This is an accident-prevention boundary, not an OS sandbox. The launcher
reconstructs the child environment from explicit fixture values and inspected
executable locations instead of merging the ambient shell environment, but
repository code and installed dependencies still execute with the worktree
user's permissions. The lane does not provide network isolation for the host,
does not start or configure Allura Brain/MCP, and must never receive production
data or credentials.
