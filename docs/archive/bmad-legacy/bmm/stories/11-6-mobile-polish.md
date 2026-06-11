# Story 11.6 — Mobile Polish

## Story

As an operator accessing the Allura dashboard on a mobile device, I want touch-optimized interactions, swipe navigation, and a bottom nav bar, so I can use every surface without frustration on small screens.

**Priority:** P3-Low | **Complexity:** Medium | **Agent:** Woz | **Roadmap Step:** 11
**Repo:** `allura-memory` (dashboard — `src/app/dashboard/`, `src/components/`)

**Dependencies:** Story 11.5 (Dashboard Route Parity) — all routes must exist before mobile nav can link them.

## Traceability

Epic 11 -> FR38 -> `docs/archive/bmad-legacy/bmm/planning/epics.md` line 232 (`FR38: Epic 11 - mobile surfaces have minimum 44x44px touch targets, swipe navigation for sidebar, bottom nav at ≤720px, and no horizontal scroll at 320px`) -> `bun run typecheck && bun test`

## Acceptance Criteria

- [ ] AC1: Every interactive element (buttons, links, icon buttons, toggle switches, form controls) has a minimum touch target of 44x44px on screens ≤720px — enforced via CSS `min-height` / `min-width` or padding, not the visual element size alone
- [ ] AC2: Swipe right from the left screen edge (within 30px of edge, gesture travel ≥ 80px) opens the sidebar navigation
- [ ] AC3: Swipe left on an open sidebar (gesture travel ≥ 80px) closes it
- [ ] AC4: A bottom navigation bar replaces the left sidebar on screens ≤720px; it includes links to: Chat, Search, Governance, Graph, Settings (5 primary routes); remaining routes accessible via a "More" overflow menu
- [ ] AC5: No horizontal scroll appears on any dashboard surface at 320px viewport width; all content wraps or clips within the viewport
- [ ] AC6: Body text is ≥16px on mobile to prevent iOS auto-zoom on tap
- [ ] AC7: Form inputs (`<input>`, `<textarea>`, `<select>`) have `font-size: 16px` or larger to suppress iOS automatic zoom on focus
- [ ] AC8: Bottom nav bar height is 56px (with 44px touch-target links); bottom nav uses `position: fixed; bottom: 0` and adds `padding-bottom: 56px` to main content to prevent overlap
- [ ] AC9: Bottom nav active item uses `var(--allura-blue)` icon/text color; inactive items use `var(--dashboard-text-secondary)`
- [ ] AC10: Swipe detection uses pointer events (not deprecated touch events); respects `prefers-reduced-motion` by skipping the slide animation while still triggering open/close

## Tasks/Subtasks

- [ ] Task 1: Audit all interactive elements across dashboard pages for touch target compliance; create a fix list
- [ ] Task 2: Apply `min-h-[44px] min-w-[44px]` Tailwind utilities (or equivalent CSS) to all elements identified in Task 1; do not alter visual size — use padding to expand the hit area
- [ ] Task 3: Create `src/hooks/useSwipeGesture.ts` — detects horizontal pointer swipe; returns `{ direction: "left" | "right" | null }` after threshold is met; calls provided `onSwipe` callback
- [ ] Task 4: Wire `useSwipeGesture` to the sidebar in `src/app/dashboard/layout.tsx`; open on right swipe, close on left swipe
- [ ] Task 5: Create `src/components/bottom-nav/BottomNav.tsx` — fixed bottom bar with 5 primary route links + "More" overflow; uses `usePathname()` for active state
- [ ] Task 6: Show `<BottomNav />` conditionally at ≤720px using a CSS media query or `useMediaQuery` hook; hide sidebar at ≤720px (CSS `hidden md:flex` equivalent in Tailwind)
- [ ] Task 7: Audit all pages at 320px viewport width; fix any overflowing elements (tables, code blocks, wide cards) — use `overflow-x-auto` on containers, `max-w-full` on images
- [ ] Task 8: Set `font-size: 16px` on all `<input>`, `<textarea>`, `<select>` elements via global CSS rule in `src/styles/globals.css` or Tailwind base layer
- [ ] Task 9: Unit tests — `useSwipeGesture` threshold detection, `BottomNav` active state, overflow audit helper (if applicable)
- [ ] Task 10: `bun run typecheck` clean; `bun test` green

## Dev Notes

### Governance (non-negotiable)
- No layout changes may break the desktop (≥721px) experience; all mobile-specific styles must be scoped to `@media (max-width: 720px)` or Tailwind responsive prefixes (e.g., `sm:`, not `lg:` used for mobile-only)
- Do not add a gesture library (Hammer.js, Framer Motion gestures, etc.) — implement with native pointer events

### Architecture
- Swipe detection: `pointerdown` → track `pointermove` delta → `pointerup` → if delta.x > 80px and started within 30px of left edge → fire `onSwipe("right")`
- Bottom nav breakpoint: `≤720px` — maps to Tailwind `md` breakpoint if configured at 768px, or add a custom `sm2` breakpoint at 720px in `tailwind.config.ts`
- Sidebar hide on mobile: use `hidden md:flex` class pattern on the sidebar wrapper; BottomNav shows with `flex md:hidden`
- IBM Plex Sans font for bottom nav labels

### Token Authority
- Bottom nav: `bg-[var(--allura-cream)]`, `text-[var(--allura-blue)]` (active), `text-[var(--dashboard-text-secondary)]` (inactive), `border-t border-[var(--tone-blue-bg)]`
- No hardcoded hex values in mobile components
- No inline `style={{ ... }}` with CSS var strings — use Tailwind class syntax

## Dev Agent Record

### Implementation Plan
_To be filled by Woz on implementation._

### Debug Log
_To be filled during implementation._

### Completion Notes
_To be filled on completion._

## File List

- `src/hooks/useSwipeGesture.ts` — NEW
- `src/components/bottom-nav/BottomNav.tsx` — NEW
- `src/app/dashboard/layout.tsx` — MODIFIED: swipe wiring, BottomNav mount, sidebar hide on mobile
- `src/styles/globals.css` — MODIFIED: input font-size 16px rule
- `src/__tests__/use-swipe-gesture.test.ts` — NEW: unit tests
- `src/__tests__/bottom-nav.test.tsx` — NEW: unit tests

## Change Log
- 2026-06-11: Story created (materialized from Epic 11 plan, `docs/archive/bmad-legacy/bmm/planning/epic-11-ux-polish.md`, Story 11.6 Mobile Polish) — backlog.

## Status
backlog
