# Story 10-2 — Kanban Surface

**Epic:** Epic 10 — Orchestration & Runtime  
**Status:** ready-for-dev  
**Priority:** P2-Medium | **Complexity:** Medium  
**Agent:** Woz  
**Roadmap Step:** 5  
**Traceability:** Epic 10 → FR32

**Description:**  
Build Kanban surface wired to Notion Symphony task source with real-time status. The existing Kanban skeleton has basic `draggable` with `onDragStart`/`onDrop` but no visual drag feedback and no backend connection.

## Acceptance Criteria

- [ ] Columns match Symphony states: Backlog, Ready, In Progress, Review, Done, Rejected
- [ ] Cards load from Notion via `listByStatus()` on mount and every 30s
- [ ] Drag-drop updates status via `updateStatus()` with optimistic UI update
- [ ] Drag feedback: ghost card at 0.6 opacity, drop zone highlights with border color
- [ ] Card displays: title, agent badge, priority color (P0 red, P1 orange, P2 blue, P3 gray)
- [ ] Card click expands to show: description, PR URL, CI status, proof summary, Brain receipt
- [ ] Status transitions respect the state machine (no skipping states)
- [ ] Rejected cards show feedback in proof summary field
- [ ] Loading/empty/error states per DoD (no fabricated data)
- [ ] No hardcoded task data remains

## Implementation Files

- `src/components/kanban/board.tsx` — main board component
- `src/components/kanban/column.tsx` — column component with drop zone
- `src/components/kanban/card.tsx` — task card with expanded view
- `src/lib/symphony/state-machine.ts` — valid transitions per state

## Dev Notes

**Reference Implementation:** `src/components/curator/proposal-queue.tsx` (read-only queue rendering pattern)  
**Shared Helpers:** `src/integrations/symphony/notion-task-source.ts` (from 10-1), `src/lib/notion/client.ts`  
**Test Pattern:** Mirror `src/__tests__/dashboard-schemas.test.ts` for component/integration test structure  
**Previous Learnings:** Drag-drop with optimistic updates requires debounce on backend update; drop zone must stay visible during drag hover (CSS :active not sufficient)

## Dependencies

- Story 10-1 (Notion adapter must exist)
- Notion Symphony Board database live

## Dev Agent Record

**Status:** pending

### Tasks

- [ ] 1. Define state machine: valid transitions between Backlog → Ready → In Progress → Review → Done/Rejected
- [ ] 2. Implement board.tsx: load tasks on mount + 30s poll, handle drag-drop dispatch
- [ ] 3. Implement column.tsx: drop zone with visual feedback, status-based filtering
- [ ] 4. Implement card.tsx: render task summary, expand on click to show full details
- [ ] 5. Add drag feedback CSS: ghost card, drop zone highlights, smooth transitions
- [ ] 6. Add error/empty/loading states per DoD checklist
- [ ] 7. Unit tests: component render, drag-drop handler, state machine validation
- [ ] 8. Integration test: load board → drag card → verify status updated in live data

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
