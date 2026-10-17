# Allura v1 — Blocker Analysis & Prioritized Fix Plan

> **Status:** Active — Must resolve before v1 is GO
> **Authority:** This document supersedes prior readiness notes until all items below reach ✅
> **Source of truth:** code > schemas > this document

---

## DECISION REQUIRED (Answer Before Starting Any Fix)

**Auth posture for v1 ship gate:**

> Right now `/memory`, `/curator`, and `/agents/chat` are local-dev public routes with no route guard or middleware. The curator flow hardcodes `curator-user`.

Pick one:

- [x] **Option A — Document-only auth for v1:** Routes stay public, curator is hardcoded, ship with a documented TODO. Auth is NOT a v1 ship gate.
- [ ] **Option B — Auth is a ship gate:** Add a minimal route guard (env-gated secret or simple session check) to `/curator` before shipping. `/memory` and `/agents/chat` remain public dev routes.

**Recommendation:** Option A for local/dev v1. If this is going multi-user or multi-tenant in production, Option B before any real data enters.

---

## P0 — HARD BLOCKERS (Fix First — Nothing Else Ships Until These Pass)

---

### P0-1: Schema Type Mismatch — `events.id` vs `trace_ref UUID`

**Severity:** CRITICAL — Fresh clone will fail on canonical writes and the proposals migration.

**The Conflict:**

| File | Declaration |
|------|-------------|
| `docker/postgres-init/00-traces.sql:14` | `id BIGSERIAL PRIMARY KEY` |
| `docker/postgres-init/11-canonical-proposals.sql:42` | `trace_ref UUID REFERENCES events(id)` |
| `src/mcp/canonical-tools.ts:207-226` | Inserts `randomUUID()` into `events.id` |

PostgreSQL will reject a UUID string inserted into a BIGSERIAL column. The FK `trace_ref UUID REFERENCES events(id)` also fails because you cannot reference a BIGINT PK with a UUID FK.

**Chosen Fix (minimal, non-breaking):**

Keep `events.id` as BIGSERIAL (numeric). Stop writing UUIDs into `events.id`. Store the canonical `memory_id` UUID inside `metadata` instead. Change `trace_ref` in `canonical_proposals` to `BIGINT`.

**Step-by-step:**

**Step 1 — Fix `docker/postgres-init/11-canonical-proposals.sql`:**

Change line ~42 from:
```sql
trace_ref UUID REFERENCES events(id) ON DELETE SET NULL,
```
To:
```sql
trace_ref BIGINT REFERENCES events(id) ON DELETE SET NULL,
```

**Step 2 — Fix `src/mcp/canonical-tools.ts` write path:**

In the `memory_add` implementation, stop inserting a UUID into `events.id`. The `memory_id` UUID goes into `metadata.memory_id` instead:

```typescript
// BEFORE (broken):
const eventId = randomUUID();
await pg.query(
  `INSERT INTO events (id, group_id, ...) VALUES ($1, $2, ...)`,
  [eventId, groupId, ...]
);

// AFTER (correct):
const memoryId = randomUUID(); // canonical UUID — lives in metadata
const result = await pg.query(
  `INSERT INTO events (group_id, event_type, agent_id, metadata, ...)
   VALUES ($1, $2, $3, $4, ...)
   RETURNING id`,  // id is BIGSERIAL — let Postgres assign it
  [groupId, 'memory_add', agentId,
   JSON.stringify({ memory_id: memoryId, content, score, ...rest }),
   ...]
);
const traceRef = result.rows[0].id; // BIGINT from Postgres
// use traceRef for canonical_proposals.trace_ref
```

**Step 3 — Fix canonical_proposals insert:**

When creating a proposal row, `trace_ref` should be the BIGINT returned from the events insert, not a UUID:

```typescript
// trace_ref is now BIGINT from events.id
await pg.query(
  `INSERT INTO canonical_proposals (id, group_id, content, score, trace_ref, ...)
   VALUES (gen_random_uuid(), $1, $2, $3, $4, ...)`,
  [groupId, content, score, traceRef /* BIGINT */, ...]
);
```

**Step 4 — Return the `memory_id` UUID (not the BIGINT) to callers:**

```typescript
return {
  id: memoryId,           // UUID from metadata — stable external identifier
  trace_id: traceRef,     // BIGINT — internal event ID for traceability
  status: 'episodic',
  stored: 'episodic',
  score
};
```

**Verify with:**
```bash
docker compose down -v
docker compose up -d postgres
# Wait for healthy, then:
docker exec -it <pg_container> psql -U postgres -d memory -c "\d events"
docker exec -it <pg_container> psql -U postgres -d memory -c "\d canonical_proposals"
# Should show events.id BIGINT and canonical_proposals.trace_ref BIGINT
```

---

### P0-2: Default MCP Entrypoint Is Legacy, Not Canonical

**Severity:** CRITICAL — `bun run mcp` starts the legacy server (`src/mcp/memory-server.ts`). The canonical tools at `src/mcp/canonical-tools.ts` are behind `mcp:canonical`. Agents connecting via the default path get the wrong API.

**Evidence:**
```json
// package.json:21-23
"mcp": "bun src/mcp/memory-server.ts",
"mcp:canonical": "bun src/mcp/memory-server-canonical.ts",
"mcp:http": "PORT=${OPENCLAW_PORT:-3200} bun src/mcp/openclaw-gateway-http.ts"
```

```json
// .claude/settings.json and .opencode/config.json both point to:
"command": "bun", "args": ["run", "src/mcp/memory-server.ts"]
// This is the legacy server
```

**Fix:**

**Step 1 — Swap the default script in `package.json`:**
```json
"mcp": "bun src/mcp/memory-server-canonical.ts",
"mcp:legacy": "bun src/mcp/memory-server.ts",
"mcp:canonical": "bun src/mcp/memory-server-canonical.ts"
```

**Step 2 — Update `.claude/settings.json` mcpServers.allura-memory:**
```json
"allura-memory": {
  "command": "bun",
  "args": ["run", "src/mcp/memory-server-canonical.ts"],
  "cwd": "/home/ronin704/Projects/allura memory"
}
```

**Step 3 — Update `.opencode/config.json` _allura.mcpServers.allura-memory:**
```json
"allura-memory": {
  "command": "bun",
  "args": ["run", "src/mcp/memory-server-canonical.ts"]
}
```

**Step 4 — Verify canonical tools expose the 5 correct tool names:**
```bash
bun run mcp:canonical
# In another terminal, test tool listing via MCP introspection
# Should list: memory_add, memory_search, memory_get, memory_list, memory_delete
# Should NOT list: memory_store, ADAS gateway tools
```

---

### P0-3: CI Does Not Watch the Active Branch

**Severity:** HIGH — All CI runs (tests, typecheck, lint, build) are gated on `main`/`master`. Active development is on `new-main`. CI is effectively dark.

**Fix `.github/workflows/ci.yml` trigger:**
```yaml
on:
  push:
    branches: [main, master, new-main]
  pull_request:
    branches: [main, master, new-main]
```

**Also fix `.github/workflows/mcp-testing.yml`** — confirm its trigger branches include `new-main`. `agent-hooks.yml` already includes `new-main`; leave it.

---

## P1 — CRITICAL GAPS (Fix Before First Real Workload)

---

### P1-1: `.env.example` Is Missing Critical Variables

`DATABASE_URL`, `OPENCLAW_PORT`, and `ALLURA_DASHBOARD_PORT` are used in runtime code but absent from `.env.example`.

**Add to `.env.example`:**
```bash
# ── Core Database ─────────────────────────────────
DATABASE_URL=postgresql://ronin4life:<password>@localhost:5432/memory
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=memory
POSTGRES_USER=ronin4life
POSTGRES_PASSWORD=

# ── Port Config ───────────────────────────────────
ALLURA_DASHBOARD_PORT=3100  # Next.js dashboard dev/start port
OPENCLAW_PORT=3200       # MCP HTTP gateway port

# ── Memory Engine ─────────────────────────────────
PROMOTION_MODE=soc2      # soc2 | auto
AUTO_APPROVAL_THRESHOLD=0.85
DUPLICATE_THRESHOLD=0.95
RECOVERY_WINDOW_DAYS=30

# ── External Integrations (optional for v1) ───────
# NOTION_API_KEY=        # optional — Notion MCP integration
# EXA_API_KEY=           # optional — web search
# PERPLEXICA_URL=http://localhost:7722  # optional — self-hosted AI search (no API key needed)
```

---

### ✅ P1-2: Dashboard Is a Stub — RESOLVED (Issue #25, 2026-04-26)

~~`src/app/(main)/dashboard/page.tsx` contains only `return <>Coming Soon</>;`.~~

**Resolution:** Issue #25 complete. Real-data dashboard shipped. All screens wired to live API endpoints. Mock data removed. Build passing.

**Minimal v1 dashboard** — do not invent new subsystems. Wire directly to existing API routes:

| Widget | API Route |
|--------|----------|
| Memory count + recent traces | `/api/memory/traces` |
| Recent insights | `/api/memory/insights` |
| Pending proposals count | `/api/curator/proposals` |
| System health | `/api/health` |

Implement as server-side fetches in `page.tsx` using the same libs those routes use. Keep it minimal: 4 stat cards + 1 recent-events list. No new data layer.

---

### P1-3: Dead Route — `page-admin.tsx` Must Be Removed or Replaced

`src/app/memory/page-admin.tsx` calls `/api/memory/promotions` and `/api/memory/search` — neither route exists. It is unrouted but still present, creating confusion about what curator surface is live.

**Fix options (pick one):**
- **Delete it** if the curator dashboard at `/curator` is the real path.
- **Replace it** with a thin redirect to `/curator`.
- **Route it correctly** if `/memory/admin` is the intended curator path (requires creating the missing API routes).

**Also fix README route docs** — README currently references `/admin` for curator access, but that route does not exist. Update to reflect the actual live route.

---

### P1-4: E2E Tests Do Not Cover Canonical Memory Flow

`src/__tests__/e2e-integration.test.ts` is legacy infra coverage — it does not test `memory_add → memory_search → memory_get → memory_list → memory_delete` against the canonical path.

**Add canonical round-trip test file: `src/__tests__/canonical-memory.test.ts`**

```typescript
// Minimum coverage required:
describe('canonical memory round-trip', () => {
  it('memory_add returns { id, status, stored, score }');
  it('memory_search returns ranked results for written memory');
  it('memory_get retrieves a memory by ID');
  it('memory_list paginates correctly');
  it('memory_delete soft-deletes and excludes from search');
  it('soc2 mode routes high-score memory to proposals queue');
  it('duplicate write returns existing ID without creating duplicate');
  it('invalid group_id returns 400');
});
```

**Also fix browser test path:**
`tests/mcp/browser/dashboard.test.ts:21-28` targets `/dashboard/paperclip` which does not match actual route structure. Update to `/dashboard`.

---

### P1-5: `/agents/chat` Is Simulated — Classify or Wire

`src/app/agents/chat/page.tsx:48-74` uses `setTimeout` — no real backend flow.

**Pick one for v1:**
- **Mark as placeholder** with a visible UI notice. Do not present it as functional in any demo.
- **Wire it** to a real MCP call before shipping as a live feature.

---

## P2 — RECOMMENDED (Fix Within One Sprint of GO)

---

### P2-1: Notion Should Be Explicitly Optional

Notify, document, or remove any health check or startup check that blocks or warns on a missing `NOTION_API_KEY`. Notion is a dev convenience, not a v1 dependency.

### P2-2: Legacy `tools.ts` Should Be Clearly Separated

`src/mcp/tools.ts` exposes `memory_store`, `ADAS` gateway tools — a competing API surface. Add a header comment marking it `LEGACY — do not expose to AI agents; use canonical-tools.ts` and move it to `src/mcp/legacy/` to prevent accidental wiring.

### P2-3: Curator Hardcoded `curator-user`

The curator flow hardcodes `curator-user` as the approver identity. For v1, document this as a known TODO. For any multi-user deployment, wire to an env var or session before shipping.

---

## P3 — POLISH (Before Scaling Beyond 3 Agents)

- Add `docker-compose.dev.yml` with hot-reload for faster local iteration
- Full auth / route-group restructuring when moving to multi-user
- Real agent chat backend (replace `setTimeout` simulation)
- Notion feature completion as a proper optional plugin
- Metrics export surface (Prometheus or structured log aggregation)

---

## RECOMMENDED EXECUTION ORDER

```
Phase 1 — Schema & MCP Alignment (unblocks everything else)
  1. Fix events.id type mismatch (P0-1)
  2. Swap default MCP entrypoint to canonical (P0-2)
  3. Fresh docker compose down -v → up — verify migrations clean
  4. Verify bun run mcp lists 5 canonical tools

Phase 2 — CI & Environment (unblocks verification)
  5. Fix ci.yml and mcp-testing.yml branch triggers (P0-3)
  6. Expand .env.example with missing variables (P1-1)

Phase 3 — App Surface Cleanup (unblocks demo)
  7. Implement minimal v1 dashboard (P1-2)
  8. Remove or reroute page-admin.tsx (P1-3)
  9. Update README route docs
  10. Classify /agents/chat as placeholder or wire it (P1-5)

Phase 4 — Test Coverage (unblocks GO verification)
  11. Write canonical-memory.test.ts (P1-4)
  12. Fix browser test path (P1-4)

Phase 5 — Full Verification Matrix
  bun run typecheck
  bun run lint
  bun test
  bun run test:e2e
  bun run mcp                         ← must start canonical server
  bun run mcp:canonical               ← must expose 5 tools
  bun run mcp:http
  docker compose up
  Apply Postgres migrations on fresh stack
  Run canonical round-trip test against live stack
  Run benchmark baseline: bun run benchmark
```

---

## NOT P0 — DO NOT TREAT AS BLOCKERS

- Separate `docker-compose.dev.yml`
- Full auth/route-group restructuring
- Real agent chat backend
- Notion feature completion
- Metrics/Prometheus export
- WhatsApp / Telegram integrations

These are real work but not the shortest path to `clone → compose up → install → dev → verify`.

---

## UPDATED CHECKLIST ITEMS (ADD TO GOAL DONE PROMPT)

The following items must be added to the GOAL DONE PROMPT checklist as new hard blockers:

```
[LAYER 1 — STORAGE ADDITIONS]
✅ 1.11  events.id is BIGSERIAL; no UUID is inserted into events.id
✅ 1.12  canonical_proposals.trace_ref is BIGINT (not UUID)
✅ 1.13  canonical tools write memory_id UUID into metadata, not into events.id
✅ 1.14  RETURNING id is used to capture BIGINT trace_ref after events insert

[LAYER 2 — MCP API ADDITIONS]
✅ 2.11  Default bun run mcp starts canonical server, not legacy server
✅ 2.12  .claude/settings.json allura-brain HTTP endpoint points at canonical gateway
✅ 2.13  opencode.json allura-brain HTTP endpoint points at canonical gateway
✅ 2.14  Legacy tools.ts is not present/exposed in src/mcp

[LAYER 9 — RUNTIME ADDITIONS]
✅ 9.11  ci.yml triggers on new-main branch
✅ 9.12  mcp-testing.yml triggers on new-main branch
✅ 9.13  .env.example includes DATABASE_URL, OPENCLAW_PORT, ALLURA_DASHBOARD_PORT
✅ 9.14  Fresh docker compose down -v → up completes without migration errors
✅ 9.15  canonical-memory.test.ts exists and passes on live stack
```

---

*Authored: 2026-04-11 | Branch: new-main*
*Source of truth: code > schemas > this document*
*When code and this doc conflict — trust the code, file an update here*
