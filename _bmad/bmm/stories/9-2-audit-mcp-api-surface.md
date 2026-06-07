# Story 9.2 — Audit MCP API Surface

## Story

As an operator viewing Mission Control, I want real audit MCP tools (event queries, health report, agent activity, invariant checks) from Allura Brain, so the Health panel and audit trail show live system truth instead of a thin probe.

**Priority:** P0-Critical | **Complexity:** Medium | **Agent:** Knuth (schema) → Woz (implementation) | **Roadmap Step:** 2
**Repo:** `allura-memory` (Brain MCP server)

## Acceptance Criteria

- [ ] AC1: All 4 tools registered in Brain MCP `tools/list`: `audit_query_events`, `audit_health_report`, `audit_agent_activity`, `audit_invariant_check`
- [ ] AC2: `audit_query_events` supports filters: `agent_id`, `event_type`, `date_range`, `source`
- [ ] AC3: `audit_health_report` checks: PostgreSQL connection, Neo4j connection, embedding backfill status, curator queue depth, MCP tool availability
- [ ] AC4: `audit_invariant_check` validates all 6 governance invariants against live data and reports per-check pass/fail + violation count
- [ ] AC5: All results are append-only reads — no audit trail modification
- [ ] AC6: Pagination (limit/offset) works for large result sets
- [ ] AC7: `group_id` enforced (`^allura-[a-z0-9-]+$`) on every tool
- [ ] AC8: Integration tests cover each tool (happy + error)

## Tasks/Subtasks

- [ ] Task 1: Schema/query design (Knuth) — event-store query plan with indexes on `group_id`, `agent_id`, `event_type`, `created_at`; health probe queries
- [ ] Task 2: Implement the 4 tool handlers + register in `tools/list`
  - [ ] 2.1 `audit_query_events` (filters + pagination)
  - [ ] 2.2 `audit_health_report` (per-subsystem status object)
  - [ ] 2.3 `audit_agent_activity` (by agent_id + time_range)
  - [ ] 2.4 `audit_invariant_check` (6-invariant live check)
- [ ] Task 3: Zod validation at boundary
- [ ] Task 4: Integration tests
- [ ] Task 5: Verify all 4 via live `tools/list`

## Dev Notes

### Governance
- Append-only reads only; never mutate event/trace rows.
- `group_id` on every query; default `allura-system`.
- Reuse existing health/connection utilities (`src/lib/postgres/connection.ts`, `src/integrations/neo4j.client.ts`) rather than new clients.

### Architecture
- Shares the canonical MCP gateway with Story 9.1. Health checks should reuse existing startup-validator / health-probe logic where present (`src/lib/...`, health-metrics scope from Epic 5).
- `audit_health_report` is what makes Mission Control → Health "fully live" (currently it only probes `initialize`/`tools/list`/`memory_list`).

### Dependencies
- Independent of 9.1 at the data layer, but both land in the same MCP server; coordinate `tools/list` registration to avoid merge churn.

## Dev Agent Record

### Implementation Plan
_(to be filled by Woz)_

### Debug Log

### Completion Notes

## File List
- _(to be filled)_

## Change Log
- 2026-06-06: Story created from Epic 9 planning doc — ready-for-dev.

## Status
ready-for-dev
