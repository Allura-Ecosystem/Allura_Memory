# Story 13.2: Live Operational Truth

**Status:** partially-verified — 2026-06-12
**Priority:** P0
**Source:** Epic 13.2, F44-F47, AD-31, RK-19

> **Evidence (2026-06-12, Team RAM / Claude CLI):** Introduced the operational
> state contract `src/lib/operational-state/` — a pure, typed mapping of a source
> read to exactly one honest state: `ready | empty | stale | error | degraded`,
> each carrying source + freshness + recovery. Contract tests
> `operational-state.test.ts` cover all five states + clock-skew (6/6).
> **Governance** (`src/app/dashboard/governance/page.tsx`) rewritten as a live
> server component reading the curator queue (`canonical_proposals`) via
> `curator-queue-source.ts`; connection failures map to `degraded`, query
> failures to `error`, live counts to `ready`/`empty`. Runtime-verified rendering
> "Live" with source `curator-queue`, scope `allura-system`, and freshness on the
> running dashboard. **Remaining:** apply the same contract to Scheduled Tasks,
> Dreams, Settings, and Teams (still static), and wire their live sources
> (schedules, worker availability, embedding model/dimension, governed roster).

## Story

As an Allura operator, I need operational surfaces to show live, unknown, or
degraded state so that the Command Center never fabricates confidence.

## Acceptance Criteria

- [ ] Governance reads the live curator queue.
- [ ] Scheduled Tasks reads configured schedules and last-run state.
- [ ] Dreams reports actual worker availability.
- [ ] Settings reports the deployed embedding model and dimension.
- [ ] Teams reads governed agent/project sources rather than a hardcoded roster.
- [ ] Every card shows source and freshness.
- [ ] Failed sources render a degraded state and recovery action.

## Verification

- Contract tests cover ready, empty, error, stale, and degraded responses.
- Live runtime smoke verifies displayed values against source endpoints.

