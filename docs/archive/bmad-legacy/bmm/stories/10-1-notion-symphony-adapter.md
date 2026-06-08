# Story 10-1 — Notion Symphony Adapter

**Epic:** Epic 10 — Orchestration & Runtime  
**Status:** ready-for-dev  
**Priority:** P1-High | **Complexity:** Medium  
**Agent:** Woz  
**Roadmap Step:** 4  
**Traceability:** Epic 10 → FR31

**Description:**  
Implement the `NotionTaskSource` adapter specified in `symphony-notion-adapter-spec.md`. The adapter translates between Notion's API (via MCP_DOCKER tools) and Symphony's task lifecycle model. Includes the 60s polling loop and Brooks routing logic.

## Acceptance Criteria

- [ ] `NotionTaskSource` implements all 5 interface methods
- [ ] Polling loop runs at 60s interval, picks up Ready tasks
- [ ] Brooks routing logic selects agent based on title keywords (per spec Section 3)
- [ ] `claimTask()` sets Agent + Status + Session ID atomically
- [ ] `submitProof()` validates: PR URL present, CI passing, summary ≥20 chars, Brain receipt present
- [ ] Tasks with `Governance Gate = true` require HITL before Done
- [ ] Proof validation rejects incomplete submissions with clear error messages
- [ ] Unit tests cover all adapter methods
- [ ] Integration test: create task → claim → submit proof → verify status flow

## Implementation Files

- `src/integrations/symphony/notion-task-source.ts` — adapter implementation
- `src/integrations/symphony/orchestrator.ts` — polling loop + agent spawn
- `src/integrations/symphony/types.ts` — `SymphonyTask`, `ProofOfWork`, `TaskStatus` types

## Core Methods

| Method | MCP Tool | Operation |
|---|---|---|
| `getNextTask()` | `notion-query-database-view` | Filter: Status = "Ready", Sort: Priority ASC |
| `claimTask()` | `notion-update-page` | Set Agent, Status → "In Progress", Session ID |
| `updateStatus()` | `notion-update-page` | Set Status property |
| `submitProof()` | `notion-update-page` | Set PR URL, CI Status, Proof Summary, Brain Receipt |
| `listByStatus()` | `notion-query-database-view` | Filter by Status value |

## Dependencies

- Notion database "Allura Symphony Board" created with schema from spec Section 1
- MCP_DOCKER Notion tools available

## Dev Notes

**Reference Implementation:** None (new adapter)  
**Shared Helpers:** `src/lib/notion/client.ts` (Notion MCP wrapper)  
**Test Pattern:** Mirror `src/__tests__/curator-approve-route.test.ts` for route/adapter pattern  
**Previous Learnings:** Notion-MCP queries use `notion-query-database-view` (not raw database IDs); always include `filter` and `sort` as DSL strings per `notion://docs/view-dsl-spec`

## Dev Agent Record

**Status:** pending

### Tasks

- [ ] 1. Create types.ts: define `SymphonyTask`, `ProofOfWork`, `TaskStatus`, `NotionTaskSourceInterface`
- [ ] 2. Implement notion-task-source.ts: all 5 methods with group_id validation, parameterized Notion queries
- [ ] 3. Implement orchestrator.ts: 60s polling loop, Brooks routing, agent spawn
- [ ] 4. Add unit tests: test each adapter method, mocking Notion MCP responses
- [ ] 5. Add integration test: full task lifecycle (Ready → In Progress → Review → Done)
- [ ] 6. Verify: typecheck, bun test, bun run build

### Implementation Plan

(To be filled by Woz)

### Completion Notes

(To be filled by Woz)

## File List

(To be filled by Woz)

## Change Log

(To be filled by Woz)

## Status Evidence

(To be filled by Brooks after gate pass)
