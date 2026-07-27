# Story 20.5 — Memory Writeback Helper

**Status:** ready-for-dev
**Owner:** Brooks → Woz
**group_id:** allura-system
**Epic:** 20

## User Story

As an agent completing a task, I need a structured helper to write my outcome to Allura Brain, so that the trajectory engine, curator pipeline, and future agents can learn from what I did.

## Context

- `memory_add` exists but accepts freeform content
- The trajectory engine (`src/lib/sona/trajectory-engine.ts`) records memory_add calls automatically
- The content-aware curator classifies memories by category — structured content improves classification accuracy
- The genesis engine detects patterns from trajectories — structured writeback improves pattern detection

## Acceptance Criteria

- [ ] AC-1: A helper function `writeTaskOutcome(params: TaskOutcomeParams)` exists in `src/lib/memory/memory-writeback.ts`
- [ ] AC-2: `TaskOutcomeParams` includes: `task_summary`, `files_changed[]`, `outcome` (pass/fail/partial), `key_decisions[]`, `group_id`, `agent_id`
- [ ] AC-3: It calls `memory_add` with a structured content string: "Task: {summary} | Outcome: {outcome} | Files: {files} | Decisions: {decisions}"
- [ ] AC-4: It sets `metadata: { type: "task_outcome", agent_id, files_changed, outcome }` so the curator and genesis engine can parse it
- [ ] AC-5: It's exposed as an MCP tool `memory_writeback` so any agent can call it
- [ ] AC-6: Unit tests verify: structured payload is correct, group_id enforced, metadata is parseable

## Tasks

1. Create `src/lib/memory/memory-writeback.ts`
2. Add `memory_writeback` to the MCP tool registry
3. Create `src/__tests__/memory-writeback.test.ts`
4. Run `bun run typecheck && bun test`

## File List

- `src/lib/memory/memory-writeback.ts` (NEW)
- `src/mcp/canonical-http-gateway.ts` (MODIFY — add tool)
- `src/__tests__/memory-writeback.test.ts` (NEW)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |