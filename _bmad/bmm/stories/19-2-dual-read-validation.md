# Story 19.2 — Dual-Read Validation

**Status:** blocked (needs 19.1)
**Owner:** Brooks → Woz + Bellard
**group_id:** allura-system
**Epic:** 19

## User Story

As the Allura architect, I need a dual-read validation period where both Neo4j and RuVector graph backends are read simultaneously and results are diffed, so that we catch any divergence before Neo4j goes read-only.

## Context

- After 19.1 proves live-DB E2E works with `GRAPH_BACKEND=ruvector`
- Dual-read means: for every read query, hit both backends, compare results, log divergence
- This runs for one release cycle before the default is flipped (AD-49, REQ-RV-004)
- RK-32 mitigation: "dual-read validation for one release; no canonical promotion until sign-off"

## Acceptance Criteria

- [ ] AC-1: A dual-read mode is implemented behind a flag (e.g., `GRAPH_DUAL_READ=true`)
- [ ] AC-2: When dual-read is enabled, every graph read query hits both Neo4j and RuVector backends
- [ ] AC-3: Results are compared and divergence is logged with: query, Neo4j result, RuVector result, diff
- [ ] AC-4: Divergence rate is tracked (target: 0% divergence on identical data)
- [ ] AC-5: The dual-read mode does NOT change which backend is authoritative (Neo4j remains source of truth)
- [ ] AC-6: A report is generated showing divergence count, types of divergence, and timing impact
- [ ] AC-7: If divergence is found, it's documented with root cause (not just "they differ")

## Tasks

1. Read `src/lib/graph-adapter/factory.ts` to understand backend selection
2. Implement dual-read mode behind `GRAPH_DUAL_READ=true` flag
3. For each IGraphAdapter read method, call both adapters and compare results
4. Log divergence to PostgreSQL events (append-only, group_id=allura-system)
5. Run dual-read for a bounded period (test run, not full release cycle yet)
6. Generate divergence report
7. Document results

## Dev Notes

- This is a test/benchmark run, not a full release cycle. The story proves the dual-read mechanism works, not that it ran for a month.
- **Pattern to follow:** Circuit breaker pattern from RK-08 (embedding latency) — same compare-and-log approach.

## File List

- `src/lib/graph-adapter/factory.ts` (edit — add dual-read mode)
- `src/lib/graph-adapter/dual-read-adapter.ts` (new — wrapper that calls both and compares)
- `docs/archive/allura/evidence/dual-read-report.md` (new — divergence report)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-12 | Story created | Brooks |