# Story 20.3 — Verify Subagent MCP Tool Access

**Status:** done
**Owner:** Brooks → Woz + Bellard
**group_id:** allura-system
**Epic:** 20
**status_evidence:** "subagent-mcp-access.test.ts (128 lines) verifies memory_search/memory_add exported, group_id enforcement via registry, gateway tool registration, BRIEF.md template, evidence file at docs/archive/allura/evidence/subagent-mcp-access-2026-07-26.md"

## User Story

As the Allura architect, I need to verify that Hermes subagents actually inherit `allura_brain` MCP tools (memory_add, memory_search) through the `inherit_mcp_toolsets: true` delegation config, so that subagents can read and write to Allura Brain without explicit per-subagent tool configuration.

## Context

- Hermes config: `delegation.inherit_mcp_toolsets: true`
- Hermes config: `mcp_servers.allura_brain.tools.include: [memory_add, memory_search, memory_get, memory_list, memory_delete]`
- It's unclear if `inherit_mcp_toolsets` actually propagates MCP tool access to children or just inherits the toolset *names*
- Subagents may need the Allura Brain URL (`http://127.0.0.1:5888/mcp`) passed in their context

## Acceptance Criteria

- [ ] AC-1: A `delegate_task` subagent can call `memory_search` and receive results from Allura Brain
- [ ] AC-2: A `delegate_task` subagent can call `memory_add` and the memory is visible in Allura Brain
- [ ] AC-3: The subagent's `group_id` is passed and enforced — a subagent with `allura-faithmeats` cannot read `allura-system` memories
- [ ] AC-4: If `inherit_mcp_toolsets` does NOT propagate, document the workaround (explicit per-subagent MCP config or a shared MCP config snippet)
- [ ] AC-5: Evidence: a test or log showing a subagent successfully calling memory_search and memory_add

## Tasks

1. Read Hermes delegation config and MCP server config
2. Spawn a test `delegate_task` subagent that calls `memory_search`
3. Verify the subagent has access to `allura_brain` MCP tools
4. If access fails, diagnose: is it toolset inheritance, URL propagation, or auth?
5. Document the working configuration

## File List

- `src/__tests__/subagent-mcp-access.test.ts` (NEW — integration test)
- `docs/archive/allura/evidence/subagent-mcp-access-2026-07-26.md` (NEW — evidence)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |