# Story 11.2 — Toast Notification System

## Story

As an operator of the Allura dashboard, I want a non-blocking toast notification system with success, error, warning, and info variants, so I receive actionable feedback on every operation without modal interruption.

**Priority:** P3-Low | **Complexity:** Small | **Agent:** Woz | **Roadmap Step:** 11
**Repo:** `allura-memory` (dashboard — `src/components/toast/`, `src/store/`)

> **Cross-ref:** Story 9.4 (Wire Memory Add Modal) expects a toast on success. If 9.4 lands first, it ships a minimal toast that this story generalizes. This story owns the canonical implementation.

## Traceability

Epic 11 -> FR36 -> `docs/archive/bmad-legacy/bmm/planning/epics.md` line 230 (`FR36: Epic 11 - toast notification system (Story 11.2)`) -> `bun run typecheck && bun test`

## Acceptance Criteria

- [ ] AC1: Toast component supports four variants: `success`, `error`, `warning`, `info` — each with a distinct icon and `var(--dashboard-*)` token color
- [ ] AC2: Toasts auto-dismiss after a configurable duration (default 5000ms); duration can be overridden per toast call
- [ ] AC3: Manual dismiss available via an X button on each toast; X button meets 44x44px touch target minimum
- [ ] AC4: Optional action button (e.g., "Undo", "View", "Retry") rendered when `action: { label, onClick }` is provided
- [ ] AC5: At most 3 toasts visible simultaneously; when a 4th arrives the oldest is removed first
- [ ] AC6: Toasts stack in the bottom-right corner; each slides in with a 200ms ease-out animation; slide direction is upward
- [ ] AC7: Zero `alert()` or `confirm()` calls remain anywhere in dashboard code after this story ships; zero `console.log` used as user-visible feedback
- [ ] AC8: `useToast()` hook or `toast()` utility is the single call-site API for all notification triggers
- [ ] AC9: Toasts are announced to screen readers via `aria-live="polite"` region; `role="status"` on the container
- [ ] AC10: `prefers-reduced-motion` disables slide animation but keeps toast visibility

## Tasks/Subtasks

- [ ] Task 1: Create `src/components/toast/Toast.tsx` — individual toast card with variant icons, auto-dismiss timer, X dismiss, optional action button; Tailwind + Allura tokens
- [ ] Task 2: Create `src/components/toast/ToastContainer.tsx` — fixed bottom-right container, stacking logic (max 3), ARIA live region
- [ ] Task 3: Create `src/store/toast.ts` — Zustand slice with `addToast(options)` / `dismissToast(id)` / `toasts[]`; generate unique IDs
- [ ] Task 4: Expose `useToast()` hook from `src/components/toast/useToast.ts` — returns `{ toast: (options) => void }`
- [ ] Task 5: Mount `<ToastContainer />` once in `src/app/dashboard/layout.tsx`
- [ ] Task 6: Audit and remove all `alert()` / `confirm()` / user-facing `console.log` calls from dashboard components; replace with `toast()`
- [ ] Task 7: Unit tests — render variants, auto-dismiss timer, manual dismiss, 4-toast stack rotation, action button callback, ARIA attributes
- [ ] Task 8: `bun run typecheck` clean; `bun test` green

## Dev Notes

### Governance (non-negotiable)
- No toast should display raw database error messages or stack traces to the operator; errors must be sanitized to human-readable messages
- Toast auto-dismiss timers must be cleared in cleanup (`useEffect` return) to prevent setState-after-unmount warnings

### Architecture
- State: Zustand slice in `src/store/toast.ts`; do not use React Context for this — it re-renders the entire subtree on each toast
- Animation: Tailwind `transition-transform duration-200 ease-out translate-y-full -> translate-y-0` — no animation library
- shadcn/ui `Toast` primitives may be used as the base if they are already present in `src/components/ui/`; if not, implement from scratch using the acceptance criteria as the spec
- Token usage: `var(--dashboard-success)` for success, `var(--dashboard-accent)` for warning, `var(--tone-red-text)` for error, `var(--allura-blue)` for info
- IBM Plex Sans font (not Inter or Outfit)

### Token Authority
- Tailwind `className` syntax only: `bg-[var(--dashboard-success)]`, `text-[var(--dashboard-text-primary)]`
- No inline `style={{ color: 'var(--...)' }}` — use Tailwind class syntax
- No hardcoded hex values in component code

## Dev Agent Record

### Implementation Plan
_To be filled by Woz on implementation._

### Debug Log
_To be filled during implementation._

### Completion Notes
_To be filled on completion._

## File List

- `src/components/toast/Toast.tsx` — NEW
- `src/components/toast/ToastContainer.tsx` — NEW
- `src/components/toast/useToast.ts` — NEW
- `src/store/toast.ts` — NEW
- `src/app/dashboard/layout.tsx` — MODIFIED: mount `<ToastContainer />`
- `src/__tests__/toast.test.tsx` — NEW: unit tests

## Change Log
- 2026-06-11: Story created (materialized from Epic 11 plan, `docs/archive/bmad-legacy/bmm/planning/epic-11-ux-polish.md`) — backlog.

## Status
backlog
