# Story 9.4 — Wire Memory Add Modal

## Story

As a user of the Memory surface, I want the Add Memory modal's Save button to actually write to Allura Brain, so I can capture memories from the dashboard instead of a dead form.

**Priority:** P1-High | **Complexity:** Small | **Agent:** Woz | **Roadmap Step:** Quick win (unblocked now)
**Repo:** `allura-app` (`src/main.jsx`)

## Acceptance Criteria

- [ ] AC1: Save calls `memory_add` (via `callBrainTool` / `/brain` proxy) with `group_id: "allura-system"`, `user_id`, and `content` from the form
- [ ] AC2: Loading state shown during the API call (button disabled + spinner)
- [ ] AC3: Success → toast notification + close modal + refresh the memory list
- [ ] AC4: Error → inline error message in the modal with a Retry button
- [ ] AC5: Empty/whitespace content is blocked client-side (no blank memories submitted)
- [ ] AC6: Content field supports multiline text
- [ ] AC7: Passes the DoD test for the memory surface (Story 9.3)

## Tasks/Subtasks

- [ ] Task 1: Locate the Add Memory modal + Save handler in `src/main.jsx`; identify the existing `callBrainTool` helper
- [ ] Task 2: Wire Save → `callBrainTool("memory_add", { group_id, user_id, content })`
- [ ] Task 3: Loading / success / error states; content validation
- [ ] Task 4: On success, refresh the memory list (reuse the existing fetch path)
- [ ] Task 5: Toast on success (minimal toast acceptable; Epic 11 Story 11.2 generalizes it)
- [ ] Task 6: Verify end-to-end through the `/brain` proxy (real write lands in Brain)

## Dev Notes

### Governance
- `group_id: "allura-system"` on the write; `user_id` from session/admin. This is an append (episodic) write — fine; no promotion, no HITL bypass.
- Reuse the existing same-origin `/brain` proxy and `callBrainTool` (added this session) — do not reintroduce hardcoded `localhost:5888`.

### Architecture
- This is the smallest wiring gap. `memory_add` already exists on the Brain MCP (verified live this session). Pattern mirrors the Epic 8 read-tab wiring (loading/error/empty/ready), just for a write.

### Dependencies
- None hard. Toast can ship minimal here and be generalized by Story 11.2.

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
