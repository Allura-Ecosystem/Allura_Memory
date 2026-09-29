# Story 20.4 — Memory Brief Helper

**Status:** done
**Owner:** Brooks → Woz
**group_id:** allura-system
**Epic:** 20
**status_evidence:** "memory-brief.ts (205 lines) implements getMemoryBrief with categorization (priorWork/decisions/blockers), MCP tool wrapper; memory-brief.test.ts (250+ lines) verifies categorization, group_id enforcement, empty results, limit clamping, tool wrapper"

## User Story

As an agent starting a task, I need a lightweight helper that queries Allura Brain for prior work on my topic, so that I don't repeat work that's already been done and I have context from previous sessions.

## Context

- `memory_search` exists in the MCP gateway but returns raw results
- Agents need filtered, relevant context — not a dump of all memories
- The SONA trajectory engine records task outcomes but agents don't query it before starting
- Token cost matters — a good brief helper returns 3-5 relevant memories, not 50

## Acceptance Criteria

- [ ] AC-1: A helper function `getMemoryBrief(topic: string, group_id: string)` exists in `src/lib/memory/memory-brief.ts`
- [ ] AC-2: It calls `memory_search` with the topic query, limited to 5 results, sorted by relevance
- [ ] AC-3: It filters results to only include memories from the caller's `group_id` — no cross-tenant leakage
- [ ] AC-4: It returns a structured brief: `{ priorWork: Memory[], decisions: Memory[], blockers: Memory[] }` categorized by event_type
- [ ] AC-5: It's exposed as an MCP tool `memory_brief` so any agent can call it
- [ ] AC-6: Unit tests verify: returns filtered results, respects group_id, handles empty results gracefully

## Tasks

1. Create `src/lib/memory/memory-brief.ts`
2. Add `memory_brief` to the MCP tool registry in `src/mcp/canonical-http-gateway.ts`
3. Create `src/__tests__/memory-brief.test.ts`
4. Run `bun run typecheck && bun test`

## File List

- `src/lib/memory/memory-brief.ts` (NEW)
- `src/mcp/canonical-http-gateway.ts` (MODIFY — add tool)
- `src/__tests__/memory-brief.test.ts` (NEW)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |