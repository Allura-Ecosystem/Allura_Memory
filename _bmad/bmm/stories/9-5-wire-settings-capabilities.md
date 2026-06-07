# Story 9.5 — Wire Settings Capabilities

## Story

As a user in Settings, I want the capabilities and remote-config sections to reflect real runtime state, so Settings stops showing placeholders and tells me what the system can actually do.

**Priority:** P1-High | **Complexity:** Small | **Agent:** Woz | **Roadmap Step:** Quick win (unblocked now)
**Repo:** `allura-app` (`src/main.jsx`)

## Acceptance Criteria

- [ ] AC1: Existing agent config continues working unchanged
- [ ] AC2: Capabilities section reads from actual runtime state (which MCP tools are available — from `tools/list`)
- [ ] AC3: Remote config shows connected MCP server status (from the Mission Control probe)
- [ ] AC4: Model preference dropdown persists to localStorage
- [ ] AC5: Theme preference persists to localStorage (prep for Epic 11 Story 11.3 Dark Mode)
- [ ] AC6: No placeholder text remains in Settings
- [ ] AC7: Passes the DoD test for the settings surface (Story 9.3)

## Tasks/Subtasks

- [ ] Task 1: Locate Settings (`PlaceholderSettings` / settings sections) in `src/main.jsx`
- [ ] Task 2: Capabilities → derive from a live `tools/list` call via `callBrainTool`/proxy (show real available tools)
- [ ] Task 3: Remote config → reuse the Mission Control health/probe result for connected-server status
- [ ] Task 4: Persist model + theme preferences to localStorage
- [ ] Task 5: Remove placeholder copy; add loading/empty/error states
- [ ] Task 6: Verify against live runtime

## Dev Notes

### Governance
- Client preferences (model, theme) → localStorage. Any shared config that touches Brain uses `group_id: "allura-system"`.
- Capabilities are derived from real `tools/list`, not a hardcoded list (truthfulness principle).

### Architecture
- Reuse the Mission Control probe (already partially live) for remote/server status instead of a second probe path.
- Theme persistence here is the storage half of Epic 11 Story 11.3 (Dark Mode); coordinate the localStorage key.

### Dependencies
- Soft dependency on the Mission Control probe path (exists). No new backend required.

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
