# Epic 20 Retrospective — Subagent Memory Access (Hermes ↔ Allura Wiring)

**Date:** 2026-07-27
**Epic:** 20 — Subagent Memory Access — Hermes ↔ Allura Wiring
**Status:** Complete
**Owner:** Brooks (dispatched via Hermes delegate_task as Woz + Bellard)

## What Went Well

1. **group_id registry was straightforward.** Mapping 4 tenants (system, faithmeats, difference-driven, coding) to their default group_ids and allowed group_ids was a clean config module. The `isAgentAllowedGroupId` function made cross-tenant enforcement trivial to test.

2. **Canonical tools were already in place.** The MCP gateway already exposed `memory_search` and `memory_add` — this epic was about wiring and verification, not building new MCP infrastructure.

3. **Memory brief helper categorization worked well.** The regex-based categorization (priorWork / decisions / blockers) is simple but effective. The "priorWork as default bucket" pattern ensures no memory is lost — uncategorized results still appear.

4. **Memory writeback content format is parseable.** The "Task: {summary} | Outcome: {outcome} | Files: {files} | Decisions: {decisions}" format is both human-readable and machine-parseable. The curator pipeline and genesis engine can extract structured data from it.

5. **Tests are comprehensive.** 250+ lines per test file, covering categorization, group_id enforcement, empty results, limit clamping, field validation, and MCP tool wrapper envelopes.

## What Didn't Go Well

1. **Story 20.3 status was already marked done.** The first dispatch (Woz + Bellard) completed it but the sprint-status.yaml wasn't updated. Had to manually reconcile.

2. **TypeScript strict mode caught mock typing issues.** The `vi.fn()` mock calls return `[]` tuple type, so accessing `mock.calls[0][0]` fails typecheck. Had to cast through `any[]` to access call arguments. This is a recurring pattern in the test suite.

3. **MCP tool registration in canonical-http-gateway.ts was already done.** Stories 20.4 and 20.5 mention adding tools to the gateway, but the gateway already had `memory_search` and `memory_add`. The new `memory_brief` and `memory_writeback` wrappers are library functions, not separate MCP tools — they call the existing canonical tools internally.

## Lessons Learned

- **The "priorWork as default bucket" pattern is a good UX choice.** Agents always get context, even when categorization doesn't match. Better to show something than nothing.
- **Structured content format should be documented.** The "Task: ... | Outcome: ... | Files: ... | Decisions: ..." format should be in the BRIEF.md template so agents know what format to expect.
- **Mock typing in vitest requires `as any[]` casts.** This is a known limitation — the mock.calls type doesn't propagate the function's parameter types. Document this pattern for future test authors.

## What Shipped

- `src/lib/config/group-id-registry.ts` — 4-tenant group_id mapping with cross-tenant rejection
- `templates/BRIEF.md` — delegate_task brief template with mandatory memory_search/memory_add steps
- `src/__tests__/subagent-mcp-access.test.ts` — 128 lines, verifies MCP tool access and group_id enforcement
- `src/lib/memory/memory-brief.ts` — 205 lines, getMemoryBrief with categorization + MCP wrapper
- `src/__tests__/memory-brief.test.ts` — 250+ lines, categorization + group_id + empty results + wrapper tests
- `src/lib/memory/memory-writeback.ts` — 187 lines, writeTaskOutcome with structured content/metadata + MCP wrapper
- `src/__tests__/memory-writeback.test.ts` — 250+ lines, content format + metadata + validation + wrapper tests

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-27 | Retrospective written | Gilliam |