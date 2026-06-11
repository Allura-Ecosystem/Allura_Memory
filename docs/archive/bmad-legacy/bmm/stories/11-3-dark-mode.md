# Story 11.3 — Dark Mode

## Story

As an operator of the Allura dashboard, I want a dark mode that respects my system preference and can be toggled manually in Settings, so I can work comfortably in low-light environments without sacrificing readability.

**Priority:** P3-Low | **Complexity:** Medium | **Agent:** Woz | **Roadmap Step:** 11
**Repo:** `allura-memory` (dashboard — `src/styles/`, `src/app/dashboard/`)

**Dependencies:** Story 9.5 (Wire Settings Capabilities) — manual toggle lives in the Settings page wired there.

## Traceability

Epic 11 -> FR37 -> `docs/archive/bmad-legacy/bmm/planning/epics.md` line 231 (`FR37: Epic 11 - dark mode (Story 11.3)`) -> `bun run typecheck && bun test`

## Acceptance Criteria

- [ ] AC1: All dashboard color values are expressed as CSS custom properties; no hardcoded hex values remain in component `className` strings or `style` attributes
- [ ] AC2: Light theme token values are defined under `:root`; dark theme overrides are defined under `[data-theme="dark"]` in `src/styles/brand-tokens.css` or a new `src/styles/dark-theme.css`
- [ ] AC3: On first load, `prefers-color-scheme: dark` is detected and `data-theme="dark"` is applied to `<html>` before first paint (no flash of wrong theme)
- [ ] AC4: If a manual preference is stored in `localStorage` under key `allura-theme`, it takes precedence over the system preference on all subsequent loads
- [ ] AC5: A theme toggle in the Settings page (Story 9.5 surface, `/dashboard/settings`) persists the choice to `localStorage` and applies `data-theme` immediately without page reload
- [ ] AC6: All text/background combinations in dark mode meet WCAG 2.1 AA contrast ratio (minimum 4.5:1 for body text, 3:1 for large text and UI components)
- [ ] AC7: Charts, graph views, status badges, and toast variants adapt to dark mode via the same `var(--*)` token system — no hard-coded dark overrides in component files
- [ ] AC8: Font remains IBM Plex Sans in both modes; no font-face differences between themes
- [ ] AC9: `prefers-reduced-motion` is respected — no transition animation on theme switch when reduced motion is preferred

## Tasks/Subtasks

- [ ] Task 1: Audit `src/styles/brand-tokens.css` and `src/styles/presets/allura.css` — list all tokens that need dark-mode override values; document light vs dark mappings
- [ ] Task 2: Add `[data-theme="dark"]` block to `src/styles/brand-tokens.css` with dark-mode token overrides; verify 4.5:1 contrast for each pair
- [ ] Task 3: Create `src/hooks/useTheme.ts` — reads `localStorage.getItem("allura-theme")` or `window.matchMedia("(prefers-color-scheme: dark)")`, sets `document.documentElement.setAttribute("data-theme", ...)`, exposes `theme` and `setTheme()`
- [ ] Task 4: Inject inline script in `src/app/layout.tsx` `<head>` to read `localStorage` and set `data-theme` before hydration (prevents FOCT — flash of correct theme requires script before CSS paint)
- [ ] Task 5: Add theme toggle control to `/dashboard/settings` — calls `setTheme("dark" | "light" | "system")`; writes to `localStorage`
- [ ] Task 6: Audit all dashboard components for hardcoded hex or non-token Tailwind color utilities (`bg-gray-100`, `text-zinc-900`, etc.); replace with `var(--*)` tokens
- [ ] Task 7: Verify Knowledge Graph view (`/dashboard/graph`) canvas and card colors adapt to dark mode via token-driven rendering
- [ ] Task 8: Unit tests — `useTheme` localStorage read/write, system preference detection mock, `data-theme` attribute toggling
- [ ] Task 9: `bun run typecheck` clean; `bun test` green

## Dev Notes

### Governance (non-negotiable)
- `group_id: allura-system` not directly relevant to this story; no Brain writes required
- `localStorage` key is `allura-theme`; valid values are `"light"`, `"dark"`, `"system"` — Zod validate the read value; fall back to `"system"` on invalid

### Architecture
- Inline script in `<head>` must be minimal (< 300 bytes) and not import any module; it is a raw `<script dangerouslySetInnerHTML>` or Next.js Script with `strategy="beforeInteractive"`
- Do not use `next-themes` unless it is already a dependency; implement the theme hook directly
- Canvas-based components (Knowledge Graph ForceGraph2D) must consume `tokens.color.*` from `src/lib/tokens.ts` (Path 2 — JS-only context); tokens.ts must expose dark-mode variants keyed by theme
- Tailwind CSS v4 dark mode: configure `darkMode: ['attribute', '[data-theme="dark"]']` in `tailwind.config.ts` if not already set

### Token Authority
- Tailwind `className` syntax: `dark:bg-[var(--allura-charcoal)]` or `bg-[var(--dashboard-surface)]` (token switches by theme)
- Preferred: a single `var(--dashboard-surface)` that changes value between `:root` and `[data-theme="dark"]` — avoids Tailwind dark: variants entirely
- No hardcoded hex values in component code
- No inline `style={{ backgroundColor: 'var(--...)' }}` — use Tailwind class syntax

## Dev Agent Record

### Implementation Plan
_To be filled by Woz on implementation._

### Debug Log
_To be filled during implementation._

### Completion Notes
_To be filled on completion._

## File List

- `src/styles/brand-tokens.css` — MODIFIED: add `[data-theme="dark"]` override block
- `src/hooks/useTheme.ts` — NEW
- `src/app/layout.tsx` — MODIFIED: add inline FOCT-prevention script
- `src/app/dashboard/settings/page.tsx` — MODIFIED: add theme toggle control
- `src/lib/tokens.ts` — MODIFIED (if needed): expose dark-mode variants for canvas consumers
- `src/__tests__/use-theme.test.ts` — NEW: unit tests

## Change Log
- 2026-06-11: Story created (materialized from Epic 11 plan, `docs/archive/bmad-legacy/bmm/planning/epic-11-ux-polish.md`) — backlog.

## Status
backlog
