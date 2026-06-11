# Story 11.1 — Command Palette

## Story

As an operator of the Allura dashboard, I want a Cmd+K command palette that fuzzy-searches across pages, Brain memories, actions, and settings, so I can navigate and act without lifting my hands from the keyboard.

**Priority:** P3-Low | **Complexity:** Medium | **Agent:** Woz | **Roadmap Step:** 11
**Repo:** `allura-memory` (dashboard — `src/app/dashboard/`, `src/components/command-palette/`)

## Traceability

Epic 11 -> FR35 -> `docs/archive/bmad-legacy/bmm/planning/epics.md` line 229 (`FR35: Epic 11 - command palette (Story 11.1)`) -> `bun run typecheck && bun test`

## Acceptance Criteria

- [ ] AC1: Cmd+K (macOS) and Ctrl+K (Windows/Linux) opens the palette overlay from any dashboard page
- [ ] AC2: Focus trap activates on open; Tab and Shift+Tab cycle only within the palette; Escape closes and returns focus to the previously focused element
- [ ] AC3: Fuzzy search matches across: page names (8 routes), action names, settings labels; results appear within one render cycle (no server round-trip for static items)
- [ ] AC4: Recent actions (up to 5) are shown when query is empty
- [ ] AC5: Brain memory search fires after 3+ characters with 200ms debounce; results prepend a "Memories" group above navigation results
- [ ] AC6: Arrow Up / Arrow Down navigate results; Enter activates the highlighted item; result list scrolls to keep selection visible
- [ ] AC7: ARIA roles applied: `role="combobox"` on input, `role="listbox"` on results, `role="option"` on each item, `aria-activedescendant` tracks highlighted option, `aria-expanded` reflects open state
- [ ] AC8: Screen reader announces result count change on each keystroke (live region)
- [ ] AC9: Palette does not render until first open (lazy mount); unmounts on close to avoid memory leaks
- [ ] AC10: Font is IBM Plex Sans (not Inter or Outfit); overlay uses `var(--allura-cream)` background and `var(--dashboard-text-primary)` text tokens

## Tasks/Subtasks

- [ ] Task 1: Create `src/components/command-palette/CommandPalette.tsx` — Radix UI `Dialog` + `Command` (cmdk) or custom implementation; focus trap, keyboard bindings, ARIA attributes
- [ ] Task 2: Create `src/components/command-palette/useCommandPalette.ts` — Zustand slice or React context for open/close state; expose `open()` / `close()` / `toggle()` to consumers
- [ ] Task 3: Wire global Cmd+K / Ctrl+K listener in root layout (`src/app/dashboard/layout.tsx`); remove listener on unmount
- [ ] Task 4: Populate static item registry — 8 dashboard page routes, action list, settings labels
- [ ] Task 5: Add Brain memory search — call `/api/memory/search` with debounced query (200ms); show loading indicator; gracefully degrade on error
- [ ] Task 6: Apply Allura token styles — IBM Plex Sans, `bg-[var(--allura-cream)]`, `text-[var(--dashboard-text-primary)]`, `border-[var(--tone-blue-bg)]`
- [ ] Task 7: Unit tests — open/close, keyboard navigation, ARIA attributes, Brain search debounce, empty query recent-actions render
- [ ] Task 8: `bun run typecheck` clean; `bun test` green

## Dev Notes

### Governance (non-negotiable)
- `group_id: allura-system` on every Brain memory search call
- Brain search response must never be cached to localStorage or client state beyond the current palette session
- No fake memory results; if Brain is unreachable, show "Brain unavailable — showing pages only" in the results footer

### Architecture
- Palette trigger lives in `src/app/dashboard/layout.tsx` (Server Component shell with `"use client"` trigger child)
- cmdk library is preferred if already in `package.json`; do not add a new animation library — use Tailwind transitions only
- Brain search: `POST /api/memory/search` with `{ query, group_id: "allura-system", limit: 5 }`
- Zustand store key: `commandPaletteOpen` in existing dashboard store or new `src/store/ui.ts`

### Token Authority
- Tailwind `className` syntax: `bg-[var(--allura-cream)]`, `text-[var(--dashboard-text-primary)]`
- No inline `style={{ backgroundColor: 'var(--...)' }}` — use Tailwind class syntax
- No hardcoded hex values in component code

## Dev Agent Record

### Implementation Plan
_To be filled by Woz on implementation._

### Debug Log
_To be filled during implementation._

### Completion Notes
_To be filled on completion._

## File List

- `src/components/command-palette/CommandPalette.tsx` — NEW
- `src/components/command-palette/useCommandPalette.ts` — NEW
- `src/app/dashboard/layout.tsx` — MODIFIED: add Cmd+K listener + palette mount
- `src/__tests__/command-palette.test.tsx` — NEW: unit tests

## Change Log
- 2026-06-11: Story created (materialized from Epic 11 plan, `docs/archive/bmad-legacy/bmm/planning/epic-11-ux-polish.md`) — backlog.

## Status
backlog
