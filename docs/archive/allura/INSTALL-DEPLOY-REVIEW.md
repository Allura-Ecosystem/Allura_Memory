# Install & Deploy Review

> **2026-07-02 — `brain:up` NOW SELF-BOOTSTRAPS (G1/G2/G4 closed for the Brain stack).**
> Verified by Hightower. Previously the documented one-command entrypoint
> `bun run brain:up` (→ `scripts/brain-stack.sh up`) did NOT pre-create the
> external network/volumes — only the separate `scripts/first-run.sh` did, so a
> fresh-machine user following `brain:up` still hit
> `network knowledge-network declared as external, but could not be found`.
> `scripts/brain-stack.sh` now runs `bootstrap_external_resources()` before every
> `compose up` (in both `up` and `recover`): it idempotently
> `docker network create knowledge-network` + `docker volume create`
> {memory_postgres_data, neo4j_data, neo4j_logs} (guarded by `inspect`, no-op if
> present, never destroys data) and always passes `--env-file .env --env-file
> .env.local`. `first-run.sh` remains as a standalone entrypoint.
> **Evidence:** (a) `bash -n scripts/brain-stack.sh` exit 0; (b) `docker compose
> --env-file .env --env-file .env.local config` exit 0 (externals resolve); (c)
> isolated causality smoke (project `allura-fresh-smoke2`, throwaway alpine +
> named externals): missing-external `up` fails before any container →
> `network create`+`volume create` → same `up` succeeds → re-run is a no-op;
> resources cleaned up afterward; (d) live stack uptimes unchanged (pg/neo4j
> ~36h, mcp ~8h) — no live `up`/`down` was run. **G3 (hardcoded container_name)
> is still deferred** — documented as a known limitation in `docker-compose.yml`.

> **2026-06-13 — FRESH-DEPLOY PARTIALLY VERIFIED (config valid; prod image BLOCKED by code bug).**
> Verified by Hightower this session. What is proven, what is documented-only, and the
> remaining blocker are stated precisely below. A full clean-machine boot was NOT performed
> (prod image does not yet build — see Blocker). No prod data was touched.

## 2026-06-13 Verification Entry (Hightower)

### Bootstrap procedure — `scripts/first-run.sh` (NEW, idempotent)

The base `docker-compose.yml` declares its network (`knowledge-network`) and volumes
(`memory_postgres_data`, `neo4j_data`, `neo4j_logs`) as `external: true`. On a clean
machine these do not exist, so the first `docker compose up` fails. `scripts/first-run.sh`
fixes this:

```bash
bash scripts/first-run.sh          # dev stack (hot-reload dashboard)
PROD=1 bash scripts/first-run.sh   # prod stack (compiled dashboard overlay)
```

It (1) `docker network create knowledge-network` if missing, (2) `docker volume create`
each of the three volumes if missing, (3) `docker compose ... --env-file .env --env-file
.env.local up -d` (adding `-f docker-compose.prod.yml --build` when `PROD=1`). Every create
is guarded — safe to re-run, never destroys data. Validated: `bash -n scripts/first-run.sh`
exits 0.

### Prod compose path (promoted from worktree `friendly-elgamal-f4b9ce`)

- `Dockerfile.dashboard.prod` — multi-stage: `bun install --frozen-lockfile` → `bun run
  build` → runner stage copies `node_modules + .next + public + package.json +
  next.config.ts`, runs `bun run start` (compiled `next start`, NOT the dev server).
- `docker-compose.prod.yml` — overlay that swaps the dashboard to the prod Dockerfile,
  drops the dev bind-mounts via `volumes: !reset []`, and sets `NODE_ENV=production`.
  postgres / neo4j / neo4j-init / mcp are inherited unchanged (still external volumes/net,
  so `first-run.sh` must run first).

### next.config decision — NO `output: 'standalone'` (keep node_modules+.next copy)

Chosen the proven non-standalone copy approach. Rationale: (a) the repo already documents
that **Turbopack under Bun+Docker corrupts native module hashes** (`pg-<hash>` errors —
see `Dockerfile.dashboard` header / `memory/2026-06-07.md`), so the build path is fragile
and standalone's file-tracing would add a second variable; (b) standalone would require
rewriting the runner COPY layout; (c) the explicit copy keeps dev/prod symmetric and
auditable. Not adding standalone means **zero change to the dev flow**.

### What was actually verified this session

| Check | Command | Result |
|-------|---------|--------|
| first-run.sh syntax | `bash -n scripts/first-run.sh` | ✅ exit 0 |
| merged prod config valid | `docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env --env-file .env.local config` | ✅ exit 0; dashboard resolves to `Dockerfile.dashboard.prod`, `NODE_ENV=production`, no bind-mounts; external net/volumes preserved |
| prod dashboard image builds | `docker compose ... -f docker-compose.prod.yml build dashboard` | ❌ **FAILS** — see Blocker |

### 🔴 BLOCKER — prod image does not build (application code bug, not infra)

`bun run build` (`next build`) fails collecting page data for `/api/execution-overview`:

```
Error: A "use server" file can only export async functions, found object.
  → src/server/actions/execution-view.ts:13  export const TEAM_RAM_AGENTS = [...]
Failed to collect page data for /api/execution-overview
```

`src/server/actions/execution-view.ts` is marked `"use server"` but exports a non-async
object (`TEAM_RAM_AGENTS`). Next.js forbids non-async exports from `"use server"` files.
This breaks `next build` entirely (reproduced with both Turbopack and `--webpack`). It is
a code defect, **out of Hightower's infra scope → escalated to Woz (build integration)**.
Suggested fix: move `TEAM_RAM_AGENTS` (and the type-only exports) into a plain module, or
drop the `"use server"` directive since this file is imported by a server route handler,
not called as a client-invoked server action.

### Live `up` — NOT performed (two honest reasons)

1. The prod image cannot build until the blocker above is fixed.
2. Even with a built image, true isolation is constrained: the base compose pins postgres/
   neo4j to `external: true` volumes with **hardcoded names** (`memory_postgres_data` etc.),
   so `docker compose -p allura-freshtest` would still bind the PROD volumes. A genuinely
   isolated fresh-deploy test requires an override that sets those volumes to `!reset []`
   (project-prefixed, auto-created) AND different host ports (prod occupies 3100/5432/7687/
   5888). That override is the recommended next step once the build is unblocked. **No
   `-v`, `down -v`, `volume rm`, or `prune` was run against any prod resource.**

## Status

Bootstrap automation (`first-run.sh`) and the prod compose path are **in place and config-
valid**. The compiled-image deploy path is **NOT yet verified end-to-end** — it is blocked
by the `execution-view.ts` `"use server"` defect above. Do not promote the prod deploy as
verified until that is fixed and a clean isolated `up` transcript is recorded here.

## Canonical Deploy Procedure

Run in order:

```bash
bash scripts/validate-env.sh
docker compose --env-file .env --env-file .env.local build --no-cache
docker compose --env-file .env --env-file .env.local up -d --remove-orphans
docker compose ps
curl -f http://localhost:3100/api/health/live
```

## Environment Validation

The `bash scripts/validate-env.sh` script must pass before any deploy. It validates:
- All required env vars are present
- No critical vars are missing

## Notes

- `docker compose ps` confirms all containers are running
- `curl -f http://localhost:3100/api/health/live` confirms the dashboard is serving
- Rollback: `docker compose --env-file .env --env-file .env.local down && git checkout <prev-sha> && docker compose --env-file .env --env-file .env.local up -d`
