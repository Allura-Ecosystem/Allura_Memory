<!-- Context: project-intelligence/notes | Priority: high | Version: 2.1 | Updated: 2026-04-26 -->

# Living Notes — allura Memory

> Active issues, technical debt, open questions, and current sprint state.  
> **Update:** When status changes or at session start.  
> **Archive:** Move resolved items to bottom with resolution date.

---

## Current Sprint State (as of 2026-05-05)

**Epic:** 1 — Persistent Knowledge Capture  
**Active Story:** 1.2 — TraceMiddleware Integration `[IN PROGRESS]`  
**Last Completed:** Story 1.1 ✅ RuVix Security Hardening (28/28 tests) · Issue #25 ✅ Real-data Dashboard

### Story → Requirements Traceability Bridge

| Story | Description | F# Satisfied | B# Satisfied | Use Cases |
|-------|-------------|-------------|-------------|-----------|
| **1.1** — RuVix Security Hardening | Proof-gated mutation layer; 28/28 tests | F12 · F13 | B6 · B28 | MEM-UC7 |
| **1.2** — TraceMiddleware Integration | Full HTTP request tracing for agent operations | F1 · F2 · F3 · F26 · F27 · F28 | B1 · B23 | MEM-UC1 · MEM-UC2 |
| **Issue #25** — Real-data Dashboard | Live Neo4j wired, mock removed | F10 · F11 · F35 · F36 | B5 · B27 | MEM-UC6 · MEM-UC10 |

**Canonical source:** [`docs/allura/REQUIREMENTS-MATRIX.md`](../../../../docs/allura/REQUIREMENTS-MATRIX.md#governed-memory-pipeline-–-business-→-functional-traceability) — B1–B29, F1–F40 with full Satisfied-by evidence.

**Issue #25 — Real-Data Dashboard (COMPLETED 2026-04-26 06:02)**
- Branch: `feature/real-data-dashboard-25`
- `/api/memory/graph` wired to live Neo4j data
- Mock data removed from all runtime paths
- AI-GUIDELINES.md compliance gate cleared
- Commits: `93e25582`, `db80a5d4`, `abb5464e`, `c365cf66`, `c91a045a`

**Agent Primitives:**
- 4/12 green
- 5/12 in-progress
- 3/12 red

---

## Technical Debt

| Item | Impact | Priority | Status |
|------|--------|----------|--------|
| `memory()` wrapper PENDING | Primary write-back blocker; agents can't log to Brain mid-task | High | Acknowledged |
| Neo4j memory graph dirty data | `search_memories` / `read_graph` blocked by malformed entities | High | Known |
| RuVector stubs | `ruvector_hybrid_search()` and other learning/agent functions are stubs; don't call them | Med | Deferred |

### Technical Debt Details

**`memory()` wrapper PENDING**  
*Priority:* High  
*Impact:* Agents cannot write back to Allura Brain during task execution — only at session end  
*Root Cause:* memory() wrapper not yet implemented as a first-class primitive  
*Proposed Solution:* Implement memory() wrapper in control plane layer, expose via MCP  
*Status:* Acknowledged — Story 1.2 dependency

**Neo4j Memory Graph — Dirty Entities**  
*Priority:* High  
*Impact:* `mcp__MCP_DOCKER__read_graph` and `mcp__MCP_DOCKER__search_memories` both fail with Pydantic validation errors  
*Root Cause:* Entities `Spec-Driven System` and `Prompt System` have spaces in their `type` field (violates `^[A-Za-z_][A-Za-z0-9_]*$` pattern) and null `observations`  
*Workaround:* Use `mcp__MCP_DOCKER__execute_sql` for Postgres reads; avoid neo4j-memory graph search until cleaned  
*Fix Plan:* Cypher query to delete or fix the malformed entities  
*Status:* Known — blocking session memory hydration

**RuVector Stubs**  
*Priority:* Med  
*Impact:* Calling stub functions causes silent failures  
*Root Cause:* Extension interface defined but learning/agent functions not implemented  
*Workaround:* Use `retrieveMemories()` in `src/lib/ruvector/bridge.ts` (hybrid search, BM25 RRF — this works)  
*Status:* Deferred — documented in `docs/RUVECTOR_INTEGRATION.md`

---

## Open Questions

| Question | Stakeholders | Status | Next Action |
|----------|--------------|--------|-------------|
| When does `memory()` wrapper land? | Brooks, Woz | Open | Scope into Story 1.2 or create Story 1.3 |
| Neo4j graph cleanup — safe to delete dirty entities? | Brooks | Open | Run read-only Cypher to audit scope first |
| RuVector stubs — promote to real or remove? | Brooks, Bellard | Deferred | Post-Epic-1 decision |

---

## Known Issues

| Issue | Severity | Workaround | Status |
|-------|----------|------------|--------|
| Neo4j memory search blocked | High | Use Postgres SQL via execute_sql | Known |
| `test:mcp` needs live dev server | Med | Run `bun run dev` first; `USE_REAL_MCP_DOCKER=true` for full validation | Known (by design) |
| ADAS test runs not completing | Med | See V1-BLOCKERS-AND-FIXES.md | In Progress |

---

## Patterns Worth Preserving

- **`group_id` on every DB operation** — enforced at PostgreSQL CHECK constraint, not application layer. This is the invariant that keeps multi-tenancy safe.
- **Append-only traces** — never UPDATE/DELETE on `events` table. Everything is recoverable.
- **Curator approve before Neo4j write** — `bun run curator:approve` is the only sanctioned promotion path in SOC2 mode.
- **`retrieveMemories()` for hybrid search** — `src/lib/ruvector/bridge.ts` two-pass RRF fusion (vector ANN + BM25). This works; the extension stubs do not.

## Gotchas for Maintainers

- `test:mcp` requires a running Next.js dev server (`bun run dev`) — absence gives a precondition warning, not a protocol failure
- `USE_REAL_MCP_DOCKER=true` is required to test actual Docker MCP integration (off by default)
- Dashboard is at `src/app/(main)/dashboard` on port 3100 — NOT `apps/allura-dashboard` (that was removed)
- `allura-*` tenant prefix required everywhere; `roninclaw-*` is deprecated

---

## Active Projects

| Project | Goal | Owner | Status |
|---------|------|-------|--------|
| Story 1.2 TraceMiddleware | Full HTTP request tracing for agent operations | Woz | In Progress |
| Graph View UI | Implement `/dashboard/graph` with react-force-graph-2d + live Neo4j | Woz | Queued — PRD sent to Team Durham |
| Design system — Penpot delivery | Token file, component library, 5 screen specs from design team | Design | Waiting on design |
| Neo4j graph cleanup | Fix dirty entities blocking memory search | Brooks | Queued |
| Brand docs alignment | Sync all planning/context docs to finalized brand | Brooks | ✅ Done 2026-04-26 |

---

## Archive (Resolved)

### Resolved: Issue #25 — Real-Data Dashboard
- **Resolved:** 2026-04-26
- **Resolution:** All dashboard screens wired to live API. Mock data removed. `/api/memory/graph` functional. Build passing, typecheck clean.

### Resolved: Brand Identity Docs Alignment
- **Resolved:** 2026-04-26
- **Resolution:** `BRAND-IDENTITY.md` updated to finalized brand guide. Colors corrected to `#1D4ED8 / #FF5A2E / #157A4A / #0F1115 / #C89B3C / #F6F4EF`. Typography corrected to IBM Plex Sans. Previous file had wrong Outfit/Inter stack and wrong hex values.

### Resolved: P0 MCP Validation Cleanup
- **Resolved:** 2026-04-25
- **Resolution:** `scripts/test-mcp-browser.ts` cleaned up. MCP Docker CLI check now opt-in via `USE_REAL_MCP_DOCKER=true`. Canonical Streamable HTTP test passes 12/12.

### Resolved: Dashboard Course Correction
- **Resolved:** 2026-04-25
- **Resolution:** Removed `apps/allura-dashboard` (mistaken Vercel boilerplate clone). Real dashboard confirmed at `src/app/(main)/dashboard`.

### Resolved: RuVix Security Hardening (Story 1.1)
- **Resolved:** 2026-04-xx
- **Resolution:** 28/28 tests passing. Proof-gated mutation layer complete.

---

## Related Files

- `decisions-log.md` — decisions that inform current state
- `business-domain.md` — business context for current priorities
- `technical-domain.md` — technical context for current state
- `business-tech-bridge.md` — why constraints exist
- `.opencode/context/allura/V1-BLOCKERS-AND-FIXES.md` — v1 ship gate issues
