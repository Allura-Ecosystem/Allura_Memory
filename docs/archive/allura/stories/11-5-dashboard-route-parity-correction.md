> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

# Story 11.5 Correction: Dashboard Route Parity

**Status:** partially-verified — 2026-06-12
**Priority:** P0
**Source:** Epic 13.1, F41, F47, F48, RK-19

> **Evidence (2026-06-12, Team RAM / Claude CLI):** Route parity test
> `src/__tests__/mission-control-route-parity.test.ts` passes 2/2 and is now
> wired into the default vitest lane (it was previously orphaned — in no test
> config). Root cause: the typed adapter registry (`createDefaultRegistry`)
> declared 6 Mission Control routes with **no page files**. Fix: created the
> registry-declared pages `src/app/(main)/{command,work-board,telemetry,allura,
> resources}/page.tsx` and `src/app/agents/page.tsx`, all rendering a shared
> `RouteContractSurface` that consumes the registry as the single source of
> truth (no duplicate hardcoded route lists) and declares source + freshness +
> degraded behavior per route. Approved Allura lettermark restored in the
> sidebar over the inline SVG logo (canon: no generated/drawn logo). Runtime
> smoke: all 6 routes return HTTP 200 with registry-driven headings.
> **Remaining:** sidebar/command-palette fully driven by the registry, and
> explicit legacy-route redirect documentation.

## Story

As an Allura operator, I need one canonical dashboard route taxonomy so that
navigation, tests, deep links, and desktop surfaces resolve the same product.

## Acceptance Criteria

- [ ] Canonical routes are declared in one typed route registry.
- [ ] Sidebar, command palette, tests, and deep links consume that registry.
- [ ] Legacy `/command`, `/memory`, `/agents`, and `/system` expectations are
      either migrated or explicitly redirected.
- [ ] Route parity tests pass without duplicate hardcoded route lists.
- [ ] Every route declares source, freshness, and degraded-state behavior.
- [ ] No approved Allura asset is replaced by generated or inline logo artwork.

## Verification

- Run the focused route parity suite.
- Start the dashboard and navigate every registered route.
- Capture status, title, primary heading, console errors, and network failures.

