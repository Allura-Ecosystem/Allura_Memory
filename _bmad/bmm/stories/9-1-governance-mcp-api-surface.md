# Story 9.1 — Governance MCP API Surface

## Story

As an operator of the Allura dashboard, I want real governance MCP tools (policy listing, gate checks, audit log, config) exposed by Allura Brain, so the Governance and Policy Controls surfaces show truthful, live policy state instead of hardcoded examples.

**Priority:** P0-Critical | **Complexity:** Large | **Agent:** Knuth (schema) → Woz (implementation) | **Roadmap Step:** 1
**Repo:** `allura-memory` (Brain MCP server — `src/mcp/`, `src/curator/`, schema)

## Acceptance Criteria

- [ ] AC1: All 5 tools registered in Brain MCP `tools/list`: `governance_list_policies`, `governance_get_policy`, `governance_check_gate`, `governance_update_policy`, `governance_audit_log`
- [ ] AC2: `governance_list_policies` returns real policy objects from PostgreSQL (no hardcoded array)
- [ ] AC3: `governance_check_gate` evaluates the 6 Allura invariants (group_id, append-only, SUPERSEDES, HITL, MCP-only, allura-* namespace) and returns pass/fail with reasons
- [ ] AC4: `governance_audit_log` queries the append-only event store with limit/offset pagination
- [ ] AC5: `governance_update_policy` requires an explicit HITL approval flag; without it the call is rejected (no autonomous policy mutation)
- [ ] AC6: Every tool enforces `group_id` pattern `^allura-[a-z0-9-]+$` and rejects missing/invalid group_id
- [ ] AC7: Integration tests cover all 5 tools — happy path + error/validation cases
- [ ] AC8: No mutation of historical event/trace rows (reads + append only)

## Tasks/Subtasks

- [ ] Task 1: Schema design (Knuth) — define policy storage model + governance event types in PostgreSQL; confirm append-only, group_id CHECK constraint, indexes
- [ ] Task 2: Implement the 5 tool handlers in the canonical MCP server (`src/mcp/canonical-tools.ts` + register in `canonical-http-gateway.ts` / `tools/list`)
  - [ ] 2.1 `governance_list_policies`
  - [ ] 2.2 `governance_get_policy`
  - [ ] 2.3 `governance_check_gate` (the 6-invariant evaluator)
  - [ ] 2.4 `governance_update_policy` (HITL-gated)
  - [ ] 2.5 `governance_audit_log` (paginated)
- [ ] Task 3: Zod validation at the tool boundary (group_id regex, required fields)
- [ ] Task 4: Integration tests (`bun test`) — per tool, happy + error
- [ ] Task 5: Verify via live `tools/list` over `/mcp` that all 5 surface

## Dev Notes

### Governance (non-negotiable)
- `group_id` on every read/write, pattern `^allura-[a-z0-9-]+$`; default tenant `allura-system`.
- PostgreSQL events/traces are append-only — no UPDATE/DELETE.
- `governance_update_policy` MUST route through the HITL path; never autonomously mutate policy/promotion state.
- DB ops via the canonical client/MCP layer only — never `docker exec`.

### Architecture
- MCP server entry: `src/mcp/canonical-http-gateway.ts` (Streamable HTTP, `/mcp`), tool handlers in `src/mcp/canonical-tools.ts`. Follow the existing `memory_*` tool registration pattern.
- Bearer auth is currently disabled in dev (`ALLURA_MCP_AUTH_TOKEN` unset); CORS is allow-all in dev. Keep new tools behind the same auth/governance posture.
- Dashboard consumes these via the same-origin `/brain` proxy (`callBrainTool`) — no dashboard change required in this story; surfaces are wired in follow-ups.

### Surfaces unblocked (later wiring stories)
- Mission Control → Policy Controls → `governance_list_policies` + `governance_check_gate`
- Governance Log → `governance_audit_log`
- Settings → Governance config → `governance_get_policy` + `governance_update_policy`

## Dev Agent Record

### Implementation Plan
_(to be filled by Woz at execution)_

### Debug Log

### Completion Notes

## File List
- _(to be filled)_

## Change Log
- 2026-06-06: Story created (relocated/expanded from Epic 9 planning doc) — ready-for-dev.

## Status
ready-for-dev
