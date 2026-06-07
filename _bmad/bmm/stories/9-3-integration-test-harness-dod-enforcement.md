# Story 9.3 — Integration Test Harness (Definition of Done Enforcement)

## Story

As the team, I want an automated harness that validates every dashboard surface against the 7-point Definition of Done, so "truthful" becomes an enforced gate in CI rather than a manual checklist.

**Priority:** P1-High | **Complexity:** Large | **Agent:** Woz | **Roadmap Step:** 3
**Repo:** `allura-app` (dashboard test suite) — harness targets the dashboard surfaces

## Acceptance Criteria

- [ ] AC1: Harness runs via `bun run test:dod`
- [ ] AC2: Every surface has a test file under `src/tests/dod/` covering all 7 checks
- [ ] AC3: `helpers/dod-assertions.ts` exports reusable matchers: `expectLoadingState()`, `expectEmptyState()`, `expectErrorState()`, `expectReadyState()`, `expectRealApi()`, `expectNextAction()`, `expectNoFakeStatus()`
- [ ] AC4: `helpers/mock-brain.ts` provides a mock Brain MCP for unit-level tests
- [ ] AC5: Surfaces honestly marked "not wired" pass via an explicit `skip` annotation (not a fake pass)
- [ ] AC6: CI blocks merge if any DoD test fails on a wired surface
- [ ] AC7: Test report prints a per-surface DoD status table

## Tasks/Subtasks

- [ ] Task 1: Build `helpers/dod-assertions.ts` (7 matchers) + `helpers/mock-brain.ts`
- [ ] Task 2: Create test files for currently-wired surfaces first (memory tabs) to prove the harness
- [ ] Task 3: Add test files for the remaining surfaces (curator, mission-control, governance, chat, dreams, kanban, settings) with `skip` where not yet wired
- [ ] Task 4: `bun run test:dod` script + per-surface status table reporter
- [ ] Task 5: CI wiring — fail the job on any non-skipped DoD failure

### 7-Point DoD checks (per surface)
1. Loading state · 2. Empty state · 3. Error state · 4. Ready state · 5. Real API (not hardcoded) · 6. Correct next action · 7. No fake status strings

## Dev Notes

### Architecture
- Test structure:
  ```
  src/tests/dod/
    memory-surface.test.ts · curator-surface.test.ts · mission-control.test.ts
    governance-surface.test.ts · chat-surface.test.ts · dreams-surface.test.ts
    kanban-surface.test.ts · settings-surface.test.ts
    helpers/dod-assertions.ts · helpers/mock-brain.ts
  ```
- The harness is the executable form of the project's Definition of Done. It grows as each surface is wired — a `skip` is honest, a fake pass is not.

### Dependencies
- Stories 9.1 + 9.2 must exist before the governance/audit surface tests can assert against real tools (their tests start `skip` and flip on once 9.1/9.2 land).

### Governance
- Tests must assert `group_id` is sent on every Brain call and that no surface renders fabricated "Live/Healthy" without backing data (check #7).

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
