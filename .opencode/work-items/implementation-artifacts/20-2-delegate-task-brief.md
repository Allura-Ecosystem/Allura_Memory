# Story 20.2 — Wire delegate_task Brief Template

**Status:** done
**Owner:** Brooks → Woz
**group_id:** allura-system
**Epic:** 20

## User Story

As the Allura orchestrator, I need the `delegate_task` brief template to include "query Allura Brain first" and "write outcome to Allura Brain" as mandatory steps, so that every subagent reads prior work before starting and records its results after completing.

## Context

- AGENTS.md §4 requires BRIEF.md for complex subagent work
- Hermes `delegate_task` sends a `context` field to subagents
- `inherit_mcp_toolsets: true` means subagents should have access to `allura_brain` MCP tools
- The trajectory engine (`src/lib/sona/trajectory-engine.ts`) records memory_add/search calls automatically

## Acceptance Criteria

- [ ] AC-1: The BRIEF.md template in `templates/BRIEF.md` includes a mandatory "Memory Hydration" section as step 1: "Query Allura Brain for prior work on this topic using `memory_search` with your `group_id`"
- [ ] AC-2: The template includes a mandatory "Memory Writeback" section as the final step: "Write your outcome to Allura Brain using `memory_add` with task summary, files changed, and outcome status"
- [ ] AC-3: The `delegate_task` context payload includes `group_id` so subagents know their tenant
- [ ] AC-4: A test verifies that a subagent brief contains both the hydration and writeback sections
- [ ] AC-5: The template is documented in AGENTS.md or CLAUDE.md so OpenCode agents also follow it

## Tasks

1. Read `templates/BRIEF.md` (or create if missing)
2. Add "Memory Hydration" and "Memory Writeback" sections
3. Update AGENTS.md §4 to reference the new template sections
4. Create a test that validates the template contains both sections
5. Run `bun run typecheck && bun test`

## File List

- `templates/BRIEF.md` (MODIFY or NEW)
- `AGENTS.md` (MODIFY — §4 reference)
- `src/__tests__/brief-template.test.ts` (NEW)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-26 | Story created | Gilliam |