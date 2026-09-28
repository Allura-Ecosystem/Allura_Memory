<!-- Context: project-intelligence/informant | Priority: critical | Version: 1.0 | Updated: 2026-04-11 -->

# Informant

> **Historical context, not a current startup recipe.** For local development,
> follow `.opencode/DEVELOPMENT-READINESS.md` and
> `docs/guides/isolated-development.md`. Do not run the destructive root Compose
> bootstrap below on a host running Allura. It predates the isolated dev lane.

> Historical repo notes for developers and agents; verify against current code.

## Purpose

- **What this is**: a short field manual for the current Allura Memory repo state
- **Audience**: new developers, operators, and agents hydrating context quickly
- **Use this when**: you need to know what is authoritative, what is legacy, and what currently blocks a runnable v1

---

## 1) Authority — What Is Real Right Now

### v1 Architecture Authority

For current v1 work, the authoritative runtime is:

- **PostgreSQL 16** for append-only trace/event storage
- **Neo4j 5.26** for promoted semantic memory and version lineage
- **Next.js + TypeScript + Bun** for app/runtime/tooling
- **Canonical 5-operation memory interface**:
  - `memory_add`
  - `memory_search`
  - `memory_get`
  - `memory_list`
  - `memory_delete`

### Authoritative Sources (When Docs Conflict)

Use this order:

1. **Committed code and active runtime files**
2. **Current Docker/bootstrap files actually used by fresh clone**
3. **Current API and MCP entrypoints**
4. **Repo docs updated for this branch**
5. **Planning docs / Notion / older reports**

If a plan disagrees with the running code, trust the running code until the plan is reconciled.

### Current Runtime Truths

- Root compose file in use: `docker-compose.yml`
- PostgreSQL bootstrap directory in use: `docker/postgres-init/`
- Optimization views are **not required bootstrap** and have been deferred from fresh-clone initialization
- `events.id` is a **numeric trace key**
- canonical memory identity is a **UUID stored as `metadata.memory_id`** for episodic event rows
- `canonical_proposals.trace_ref` is a **numeric foreign key** to `events(id)`

---

## 2) Boundaries — What Is Legacy, Deferred, or In Transition

### Legacy / Transitional Surfaces

- Legacy MCP surfaces still exist in the repo and are being isolated
- Canonical MCP server exists separately from older MCP entrypoints
- Do **not** assume `bun run mcp` is canonical unless the cutover is complete and verified

### Deferred / Not Part of v1 Ship Gate

- RuVector as authoritative runtime architecture
- optimization/materialized views required for bootstrap
- full docs reconciliation with older Notion architecture references
- broad historical cleanup of every stale route/doc path

### Deprecated / Risky Assumptions

- `project/project-context.md` is deprecated; prefer `project-intelligence/`
- older docs may still reference root `postgres-init/` paths that are no longer the real bootstrap path
- older docs may still assume admin/dashboard routes or MCP entrypoints that are no longer authoritative

---

## 3) Bootstrap — How To Get Running

### Fresh Clone Baseline

Use this sequence:

```bash
docker compose down -v
docker compose up -d
bun install
bun run typecheck
```

Then verify the stack, app, and tests with the current branch commands.

### Important Bootstrap Paths

- Compose: `docker-compose.yml`
- Postgres init: `docker/postgres-init/`
- Neo4j indexes script: `scripts/neo4j-memory-indexes.cypher`

### Minimum Runtime Expectations

- Postgres comes up with the required schema
- Neo4j comes up healthy
- canonical proposal table exists
- app typecheck passes

### Fresh-Clone Caveat

`pg_isready` only proves PostgreSQL accepts connections. It does **not** prove the full bootstrap chain succeeded. Always verify tables and critical schema after recreating volumes.

---

## 4) Hazards — What Future Maintainers Commonly Break

### Identity Hazards

Do not confuse these:

- `events.id` = numeric trace/event identifier
- `metadata.memory_id` = canonical UUID memory identifier for episodic rows
- `canonical_proposals.trace_ref` = numeric pointer to the source event

If you collapse these into one ID again, canonical memory behavior will drift or fail.

### Bootstrap Hazards

- `docker/postgres-init/04-optimization-views.sql` was deferred because it depended on tables not created in the required bootstrap chain
- stale compose/docs may mention `postgres-init/` at repo root; actual bootstrap uses `docker/postgres-init/`
- Postgres or MCP healthchecks may look healthy while required schema or runtime behavior is still broken

### MCP Hazards

- Root-level MCP files still include both canonical and legacy surfaces
- Do not expose both worlds as if they were equal; the v1 goal is one public canonical surface
- When moving legacy MCP, update configs and scripts together (`package.json`, `.claude/settings.json`, `config/mcporter.json`, related docs)

### UI / Route Hazards

- `/dashboard` has been a drift hotspot; shell/layout may be real even when page content is stubbed
- `page-admin.tsx` is legacy/dead surface unless explicitly routed and repaired
- `/agents/chat` may exist as UI without being backed by a real runtime flow

### Documentation Hazards

- Notion or older repo docs may describe RuVector or route structures that are not the current v1 ship target
- do not promote aspirational architecture into operational truth without verifying code/config first

---

## 5) Current Release Gate — What Still Matters For v1

The working definition of done is a **locally verifiable system**, not a theoretically runnable one.

### Still Important To Verify or Finish

- real canonical `memory_add` behavior through the public API in both `auto` and `soc2`
- canonical MCP as the default `mcp` / `mcp:http` surface
- CI running on the active branch
- real dashboard content instead of placeholder page content
- canonical tests and end-to-end verification against the fresh local stack

### Already Stabilized or Clarified

- schema identity model: numeric event IDs + UUID memory IDs + numeric proposal trace refs
- Postgres bootstrap authority lives under `docker/postgres-init/`
- project-intelligence is the right `.opencode/context/` home for repo truth

---

## 6) Do Not Improvise Here

Treat these as structural files and change them deliberately:

- `docker-compose.yml`
- `docker/postgres-init/*.sql`
- `src/mcp/*`
- `src/app/api/memory/*`
- `src/app/api/curator/*`
- `.claude/settings.json`
- `config/mcporter.json`
- `.github/workflows/*.yml`

If you touch them, verify fresh clone behavior, not just typecheck.

---

## 7) Read Next

After this file, read:

1. `docs/allura/BLUEPRINT.md` § `12) Documentation Authority & Sync Contract` for Notion↔repo doc authority
2. `technical-domain.md` for the broader technical picture
3. `living-notes.md` for active issues and debt
4. `decisions-log.md` for durable architectural decisions

If the repo is in active migration, this file is the fast truth; the others provide context.
