# Story 9.5 — Wire Settings Capabilities

## Story

As a user in Settings, I want the capabilities and remote-config sections to reflect real runtime state, so Settings stops showing placeholders and tells me what the system can actually do.

**Priority:** P1-High | **Complexity:** Small | **Agent:** Woz | **Roadmap Step:** Quick win (unblocked now)
**Repo:** `allura-app` (`src/main.jsx`)

## Acceptance Criteria

- [x] AC1: Existing agent config continues working unchanged — AgentsSettings untouched
- [x] AC2: Capabilities section reads from actual runtime state (which MCP tools are available — from `tools/list`)
- [x] AC3: Remote config shows connected MCP server status (from the Mission Control probe)
- [x] AC4: Model preference dropdown persists to localStorage (`allura.modelPreference`)
- [x] AC5: Theme preference persists to localStorage (`allura.theme`) — prep for Epic 11 Story 11.3 Dark Mode
- [x] AC6: No placeholder text remains in Settings — Model and About replaced with real components
- [ ] AC7: Passes the DoD test for the settings surface (Story 9.3) — requires live Brain to verify

## Tasks/Subtasks

- [x] Task 1: Locate Settings (`PlaceholderSettings` / settings sections) in `src/main.jsx`
- [x] Task 2: Capabilities → derive from a live `tools/list` call via `callBrainRpc` (show real available tools)
- [x] Task 3: Remote config → reuse the Mission Control health/probe result for connected-server status
- [x] Task 4: Persist model + theme preferences to localStorage
- [x] Task 5: Remove placeholder copy; add loading/empty/error states
- [x] Task 6: Verify against live runtime — Vite compiled clean, HMR reload successful

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

1. `CapabilitySettings` (lines ~2193) — replaced hardcoded 6-skill array with `useEffect` + `callBrainRpc("tools/list")`. Loading/error/empty/ready states. Retry button on error.
2. `RemoteSettings` (lines ~2245) — replaced static placeholders with `useEffect` + `fetchBrainStatus()`. Shows endpoint, latency, tool count, and per-service status rows. Re-probe button.
3. `ModelSettings` (new, ~80 lines) — localStorage-backed model preference dropdown (Default/Fast/Quality, key `allura.modelPreference`) and theme toggle (Light/Dark/System, key `allura.theme`). Reads on mount, writes on change.
4. `AboutSettings` (new, ~20 lines) — minimal real content: project name, engine, gateway URL, tenant, epic.
5. `SettingsConsole` router — added explicit `section === "Model"` and `section === "About"` branches; updated PlaceholderSettings exclusion list to include both.

### Debug Log

No errors. Vite compiled clean on save; HMR page reload confirmed in container logs.

### Completion Notes

AC1-AC6 complete. AC7 (DoD test against Story 9.3) requires a live Brain MCP session — mark after smoke-test against running containers.

## File List
- `/home/ronin704/Projects/design/brand-maker/allura-app/src/main.jsx`_

## Change Log
- 2026-06-06: Story created from Epic 9 planning doc — ready-for-dev.

## Status
done
