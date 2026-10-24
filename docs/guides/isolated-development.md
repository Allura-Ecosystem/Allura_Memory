# Isolated development

AD-45 registers dashboard host port `4002` for this lane. PostgreSQL is not
published to the host: the app reaches `postgres:5432` on a private internal
Compose network. The launcher has no port default and requires an explicit
activation signal; a locally free port is not authorization to choose another one.

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
verifies the pinned Bun version, makes a read-only `docker version` call to prove
that the selected daemon is reachable, and checks for a Compose plugin through
`docker compose version --short`. It does not query the daemon for projects,
containers, images, networks, volumes, or service status, and it does not start
or stop anything. All launcher commands also require the installed Next.js,
Vitest and TypeScript entry files plus the disposable database build inputs;
install the pinned lockfile with `bun install --frozen-lockfile` first.

The focused tests execute the real launcher against a stub Docker executable.
They do not call the host Docker CLI or daemon.

## Registered port and activation gate

The registration is recorded in `docs/allura/BLUEPRINT.md` and metadata in root
`docker-compose.yml`; that metadata does not add a service. An operator must
provide both values explicitly:

- `ALLURA_DEV_SAFE_DASHBOARD_PORT=4002`: registered dashboard host port.
- `ALLURA_DEV_SAFE_ACTIVATE=true`: fail-closed acknowledgment to start the
  task-owned disposable services. It is not a production or governance approval.

The launcher rejects any other supplied dashboard port. Without explicit operator
activation, `dev` and `db-up` refuse to run. PostgreSQL has no host port input.

For activation, commands remain fixed and accept no forwarded flags. The launcher
defaults to the root-owned `unix:///var/run/docker.sock`. On Docker Desktop for
Linux, select the current account's Desktop socket explicitly, for example:

```sh
ALLURA_DEV_SAFE_DOCKER_ENDPOINT="unix://$HOME/.docker/desktop/docker.sock" \
  bun --no-env-file run dev:safe doctor
```

Only those two exact local Unix endpoints are allowed. The launcher verifies that
the path is a socket and that its owner matches the endpoint policy. The Desktop
path comes from the current numeric UID's system account record, not ambient
`HOME`. User-owned parent symlinks are rejected; root-owned compatibility links
such as `/var/run` to `/run` remain valid. It ignores ambient `DOCKER_HOST`, Docker
context, and Docker TLS configuration; remote and other Unix endpoints fail closed.

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

`dev` requires the dashboard port because the Compose file deliberately has no
fallback. The launcher fixes the Compose
project directory, file, selected verified local Docker socket, and `/dev/null` env
file. It never invokes `brain:*`, the root Compose stack, the portfolio stack,
or an MCP service. It derives a stable project name from the linked worktree's
absolute path, so containers, images and networks are not shared with another
dev-safe worktree. The Compose file declares no named or bind-mounted volumes.

`dev` builds and starts both the app and PostgreSQL in the exact worktree-scoped
Compose project. Compose waits for PostgreSQL health before starting the app and
waits for the app health check before returning. `db-up` remains available for a
database-only schema inspection; `db-down` removes the entire disposable project.

## What is isolated

- Only the app publishes a host listener, bound to `127.0.0.1:4002`.
- PostgreSQL has no host publication and joins only the `backend` network, which
  is marked `internal: true` and has no external route.
- The app joins `backend` to reach PostgreSQL and a separate `frontend` network
  for its loopback-published listener.
- Database state uses tmpfs and is lost when the container is removed. Resource
  caps bound memory, CPU, and process count.
- The PostgreSQL build uses the repository root as context because the existing
  Dockerfile copies migrations by root-relative paths. Its Dockerfile-specific
  ignore file sends only `docker/postgres-init/**` and the public portfolio
  workspace fixture; repository state, dotenv files, Git data, build output, and
  local caches stay out of the build context.
- The app image pins Bun `1.3.14`, installs the frozen lockfile, and receives no
  dotenv files, ambient credentials, production endpoint, bind mount, or volume.

## Limits

This is an accident-prevention boundary, not an OS sandbox. The launcher
reconstructs the child environment from explicit fixture values and inspected
executable locations instead of merging the ambient shell environment, but
repository code and installed dependencies still execute with the worktree
user's permissions. The lane does not provide network isolation for the host,
does not start or configure Allura Brain/MCP, and must never receive production
data or credentials. Socket checks are a preflight rather than an atomic open:
another process with the same UID could replace a checked path component between
validation and Docker CLI use. Preventing that residual TOCTOU requires an OS-level
descriptor handoff or sandbox boundary that the Docker CLI interface does not offer.
