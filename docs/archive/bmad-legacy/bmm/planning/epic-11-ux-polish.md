# Epic 11 — UX Polish Layer

> **Superseded inventory notice (2026-06-12):** This historical six-story
> summary does not match the nine individual Epic 11 story files. Use
> `docs/archive/bmad-legacy/bmm/stories/sprint-status.yaml` and the Phase 0
> correction artifacts under `docs/allura/stories/` for
> active status. Stories 11.5 and 11.8 are reopened.

> **Status:** Backlog
> **Date:** 2026-06-06
> **Roadmap Step:** 8 (final polish)
> **Renumber note:** This epic was originally drafted as a "revised Epic 8." Epic 8 is already complete (the six live-Brain-wiring stories, 8-1…8-6). To preserve shipped history, UX Polish is renumbered to **Epic 11** (Brooks, 2026-06-06).
> **Prerequisite:** Epics 9 and 10 complete — all surfaces truthful and functional before they are polished.
> **FRs covered:** FR35, FR36, FR37, FR38

---

## Story 11.1 — Command Palette

**Title:** Implement Cmd+K command palette with global search and action dispatch
**Priority:** P3-Low | **Complexity:** Medium | **Agent:** Woz
**Traceability:** Epic 11 → FR35

**Description:**
Add a keyboard-triggered command palette (Cmd+K / Ctrl+K) that provides fuzzy search across pages, Brain memories, actions, and settings. Should feel instant — no server round-trip for navigation actions.

**Acceptance Criteria:**
- [ ] Cmd+K opens palette overlay with focus trap
- [ ] Fuzzy search across: page names, memory titles, action names, settings
- [ ] Arrow keys + Enter for navigation, Escape to close
- [ ] Recent actions shown on empty query
- [ ] Brain memory search triggers on 3+ characters (debounced 200ms)
- [ ] Accessible: ARIA roles, screen reader announces results

---

## Story 11.2 — Toast Notification System

**Title:** Build non-blocking toast system with auto-dismiss and action support
**Priority:** P3-Low | **Complexity:** Small | **Agent:** Woz
**Traceability:** Epic 11 → FR36

**Description:**
Replace `alert()` calls and missing feedback with a toast notification system. Toasts stack bottom-right, auto-dismiss after 5s (configurable), support undo actions.

**Acceptance Criteria:**
- [ ] Toast component with variants: success, error, warning, info
- [ ] Auto-dismiss with configurable duration (default 5s)
- [ ] Manual dismiss via X button
- [ ] Optional action button (e.g., "Undo", "View", "Retry")
- [ ] Stack up to 3 toasts, oldest dismissed first
- [ ] Slide-in animation (200ms ease-out)
- [ ] No toasts use `alert()` or `console.log` as user feedback

> **Cross-ref:** Story 9.4 (Wire Memory Add Modal) expects a toast on success. If 9.4 lands first, it ships a minimal toast that this story generalizes.

---

## Story 11.3 — Dark Mode

**Title:** Implement dark mode with CSS custom properties and system preference detection
**Priority:** P3-Low | **Complexity:** Medium | **Agent:** Woz
**Traceability:** Epic 11 → FR37

**Description:**
Add dark mode support using CSS custom properties. Detect system preference via `prefers-color-scheme`, allow manual override in Settings, persist choice to localStorage.

**Acceptance Criteria:**
- [ ] All colors defined as CSS custom properties (no hardcoded hex in component styles)
- [ ] Light and dark theme defined in `:root` and `[data-theme="dark"]`
- [ ] System preference detected on first load
- [ ] Manual toggle in Settings persists to localStorage (see Story 9.5)
- [ ] All surfaces readable in both themes (contrast ratio ≥ 4.5:1)
- [ ] Charts, graphs, and status indicators adapt to dark mode
- [ ] No flash of wrong theme on page load

---

## Story 11.4 — Kanban Drag-Drop Polish

> **Reconciled with Epic 10 Story 10.2.** 10.2 owns the data wiring (Notion adapter → board, status writes). This story is scoped to **interaction polish only** — drag feedback, animation, touch. Do not duplicate the adapter wiring here.

**Title:** Add drag-drop visual feedback and interaction polish to the Kanban surface
**Priority:** P3-Low | **Complexity:** Medium | **Agent:** Woz
**Traceability:** Epic 11 → (polish layer for FR32, no new FR)

**Description:**
Builds on the wired Kanban surface from Story 10.2. Adds the visual/interaction layer: ghost card, drop-zone highlighting, smooth reordering, and touch support.

**Acceptance Criteria:**
- [ ] Ghost card follows cursor during drag (0.6 opacity)
- [ ] Drop zone highlights on hover with border color
- [ ] Smooth card reorder animation on drop
- [ ] Agent assignment badge + priority color coding rendered (P0 red, P1 orange, P2 blue, P3 gray)
- [ ] Touch drag works on mobile (long-press to lift)
- [ ] Optimistic UI update already provided by 10.2 remains correct under rapid drags
- [ ] Respects `prefers-reduced-motion`

**Dependencies:** Story 10.2 (wired Kanban surface).

---

## Story 11.5 — UX Motion & Transitions

**Title:** Add page transitions, modal animations, and skeleton shimmer loading states
**Priority:** P3-Low | **Complexity:** Medium | **Agent:** Woz
**Traceability:** Epic 11 → (UX polish, no dedicated FR)

**Description:**
Currently `setPage()` swaps instantly with no animation. Add subtle transitions that make navigation feel intentional without adding latency.

**Acceptance Criteria:**
- [ ] Page transitions: 150ms fade (outgoing 80ms, incoming 70ms)
- [ ] Modal entrance: slide-up 200ms ease-out from 20px below
- [ ] Modal exit: fade-out 150ms
- [ ] Skeleton shimmer on all loading states (replace spinners where appropriate)
- [ ] No transition blocks interaction (user can click during animation)
- [ ] Reduced motion: respect `prefers-reduced-motion` — skip all animations
- [ ] Total CSS added: ≤2KB (no animation library)

---

## Story 11.6 — Mobile Polish

**Title:** Improve touch targets, swipe navigation, and responsive breakpoints
**Priority:** P3-Low | **Complexity:** Medium | **Agent:** Woz
**Traceability:** Epic 11 → FR38

**Description:**
Mobile nav works at 390px but interactions aren't touch-optimized. Fix touch target sizes, add swipe gestures for sidebar, and audit all breakpoints.

**Acceptance Criteria:**
- [ ] All interactive elements ≥ 44x44px touch target
- [ ] Swipe right from left edge opens sidebar
- [ ] Swipe left closes sidebar
- [ ] Bottom nav on mobile (≤720px) instead of sidebar
- [ ] No horizontal scroll on any surface at 320px width
- [ ] Font sizes readable without pinch-zoom (≥16px body)
- [ ] Form inputs don't trigger unwanted zoom on iOS

---

## Epic 11 Summary

| Story | Title | Priority | Complexity | Agent | Status | Depends On |
|---|---|---|---|---|---|---|
| 11.1 | Command Palette | P3-Low | Medium | Woz | Backlog | Epics 9+10 |
| 11.2 | Toast Notification System | P3-Low | Small | Woz | Backlog | — (early-usable) |
| 11.3 | Dark Mode | P3-Low | Medium | Woz | Backlog | Story 9.5 |
| 11.4 | Kanban Drag-Drop Polish | P3-Low | Medium | Woz | Backlog | Story 10.2 |
| 11.5 | UX Motion & Transitions | P3-Low | Medium | Woz | Backlog | Epics 9+10 |
| 11.6 | Mobile Polish | P3-Low | Medium | Woz | Backlog | Epics 9+10 |

**Dependencies:** All stories depend on Epics 9–10 (surfaces must be truthful and functional before they are polished). Exception: 11.2 (Toasts) is usable early and may be pulled forward to support Story 9.4.

**Definition of Done (per story):** Same 7-point checklist as all surfaces — Loading, Empty, Error, Ready, Real API, Correct next action, No fake status.

---

> **Provenance:** Adapted from `docs/archive/allura/epic-8-revised-stories.md`, renumbered 8.x → 11.x to avoid collision with the completed Epic 8. Relocated into `_bmad/bmm/planning/` on 2026-06-06.
