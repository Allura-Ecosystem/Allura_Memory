# Story 10-3 — Dreams Scheduled Tasks Backend

**Epic:** Epic 10 — Orchestration & Runtime  
**Status:** ready-for-dev  
**Priority:** P2-Medium | **Complexity:** Medium  
**Agent:** Woz  
**Roadmap Step:** 6a–6c  
**Traceability:** Epic 10 → FR33

**Description:**  
Build scheduled task CRUD, cron scheduling engine, execution via Anthropic API, and UI wiring. This story integrates 3 substories:
1. **10.3a** — Task store CRUD via Brain MCP
2. **10.3b** — Scheduler and executor with cron engine
3. **10.3c** — DreamsPage UI wiring to live task store

## Acceptance Criteria

### 10.3a — Task Store

- [ ] Create scheduled task with: name, prompt, agent, model, cron expression, enabled toggle
- [ ] Task stored in Brain as memory with `metadata.type: 'scheduled_task'`, `group_id: 'allura-system'`
- [ ] Read, update, delete (soft-delete) operations via Brain MCP
- [ ] Pause/Resume toggles `enabled` flag
- [ ] Unit tests cover CRUD operations

### 10.3b — Scheduler & Executor

- [ ] Cron engine evaluates schedules and triggers execution at correct times
- [ ] Execution sends prompt to Anthropic API, stores result as Brain trace with `source: 'scheduled_task'`
- [ ] Run Now button triggers immediate execution
- [ ] Status indicators: last run time, next run time, success/fail count, currently running
- [ ] Cron expression visual helper (human-readable preview: "Every day at 9:00 AM")
- [ ] Error recovery: failed executions logged, don't block next run
- [ ] Unit tests cover scheduler and executor

### 10.3c — UI Wiring

- [ ] DreamsPage loads tasks from Brain task store on mount
- [ ] Create/edit/delete tasks through UI forms connected to task store
- [ ] Execution history: query Brain for traces matching task ID, show in expandable rows
- [ ] No hardcoded data remains in DreamsPage
- [ ] Passes all 7 DoD checks

## Implementation Files

- `src/integrations/dreams/task-store.ts` — CRUD via Brain MCP
- `src/integrations/dreams/scheduler.ts` — cron engine
- `src/integrations/dreams/executor.ts` — task execution via Anthropic API
- `src/integrations/dreams/types.ts` — `ScheduledTask`, `TaskExecution` types
- `src/pages/dreams.tsx` — DreamsPage wired to live task store

## Dev Notes

**Reference Implementation:** `src/lib/memory/canonical-contracts.ts` (Brain MCP integration pattern)  
**Shared Helpers:** Allura Brain MCP (`memory_add`, `memory_search`, `memory_list`), Anthropic SDK  
**Test Pattern:** Mirror `src/__tests__/canonical-memory.test.ts` for Brain integration tests  
**Previous Learnings:** Cron library is `croner` (not node-cron); Brain memory search uses `query` parameter with free text; Anthropic API requires explicit `stream: true` for streaming responses. Error recovery: always log failed execution but allow next scheduled run.

## Dependencies

- Brain MCP `memory_add`, `memory_search`, `memory_list` available
- Anthropic API key in environment
- `croner` library installed

## Dev Agent Record

**Status:** pending

### Tasks

- [ ] 1. Define types: `ScheduledTask`, `TaskExecution`, `ExecutionStatus`
- [ ] 2. Implement task-store.ts: CRUD with Brain MCP, group_id validation, soft-delete
- [ ] 3. Implement scheduler.ts: croner-based schedule evaluation, trigger logic
- [ ] 4. Implement executor.ts: Anthropic API call, Brain trace storage, error handling
- [ ] 5. Implement DreamsPage wiring: load from Brain on mount, create/edit/delete forms
- [ ] 6. Add execution history UI: query Brain for traces, display in expandable rows
- [ ] 7. Add cron helper: visual preview of next run time
- [ ] 8. Unit tests: task CRUD, scheduler evaluation, executor mock
- [ ] 9. Integration test: create task → wait for scheduled trigger → verify execution logged in Brain

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
