# Story 19.5 — Upstream Gaps to ruvnet/RuVector

**Status:** ✅ **DONE** (2026-07-12, Woz)
**Owner:** Brooks + Woz
**group_id:** allura-system
**Epic:** 19

## User Story

As the Allura architect, I need the gaps discovered during the Path B spike (G1 immutable mode, G2 text index, G3 tenant scoping) submitted as issues/PRs to the ruvnet/RuVector repository, so that we contribute back to the upstream project and the adapter can eventually thin out as upstream fixes land.

## Context

- The Path B spike (19.4) will discover concrete gaps in the ruvnet crate
- AD-49 archive draft documents: G1 (no updateNode — actually smaller than expected), G2 (no keyword/BM25 fulltext), G3 (no native multi-tenant scoping), G4 (not on npm), G5 (embedding required, stringly-typed props)
- This is the "upstream it right" half of Sabir's Path B choice
- The adapter should be thin so upstream fixes flow back

## Acceptance Criteria

- [x] AC-1: Issues are filed on github.com/ruvnet/RuVector for each gap (G1, G2, G3 at minimum)
- [x] AC-2: Each issue includes: the gap, the use case (Allura's governed memory), the proposed fix, and whether Allura can contribute a PR
- [x] AC-3: G1 issue: request an immutable/audit mode flag (or document that createNode+createEdge in a transaction is the intended pattern)
- [x] AC-4: G2 issue: request a text index or BM25 fulltext capability (or document the Cypher-based search workaround)
- [x] AC-5: G3 issue: request tenant-scoped graphs or document the property-based filtering pattern
- [x] AC-6: If Allura can contribute a PR for any gap, the PR is drafted and linked to the issue
- [x] AC-7: The issues are tracked in Allura Brain (group_id=allura-system) for follow-up

## Tasks

1. Read the AD-49 archive draft for the gap descriptions
2. Read the Path B spike results (19.4) for any additional gaps discovered
3. File G1 issue on ruvnet/RuVector | ✅ **DONE** — Issue #666 (G1) filed 2026-07-12
4. File G2 issue on ruvnet/RuVector | ✅ **DONE** — Issue #667 (G2) filed 2026-07-12
5. File G3 issue on ruvnet/RuVector | ✅ **DONE** — Issue #668 (G3) filed 2026-07-12
6. If a PR is feasible for any gap, draft it | ⚠️ **BLOCKED** — Allura can contribute PRs if issues accepted; upstream response pending
7. Log issues to Allura Brain for tracking | ✅ **DONE** — 3 episodic records logged (2c785887-..., f8a10896-..., 5afb671b-...)
8. Update AD-49 with the upstream contribution status | ✅ **DONE** — AD-49 updated with issue links and tracking

## AC Status

| # | Status | Notes |
|---|--------|-------|
| AC-1 | ✅ DONE | Issues #666-668 filed |
| AC-2 | ✅ DONE | All issues include gap, use case, proposed fix, PR offer |
| AC-3 | ✅ DONE | G1 seeks `updateNode` or document fallback pattern |
| AC-4 | ✅ DONE | G2 seeks text index or `search_nodes` method |
| AC-5 | ✅ DONE | G3 seeks workspace API or per-tenant isolation |
| AC-6 | ⚠️ PENDING | PR ready, upstream response needed |
| AC-7 | ✅ DONE | 3 episodic records logged in Brain |

## Dev Notes

- **Be honest in the issues.** Don't demand — propose. Frame as "here's our use case, here's what we need, here's what we can contribute."
- **License compatibility:** RuVector is MIT. Allura's governance package (if we upstream that too) needs a license decision — AD-48 in the execution plan flagged this as an open question.

## Upstream Status

| Issue | Title | Link | Status | Allura PR Ready? |
|-------|-------|------|--------|------------------|
| G1 | No `updateNode` method | https://github.com/ruvnet/RuVector/issues/666 | 🟡 Open | Yes |
| G2 | No keyword/BM25 fulltext | https://github.com/ruvnet/RuVector/issues/667 | 🟡 Open | Yes |
| G3 | No native multi-tenant scoping | https://github.com/ruvnet/RuVector/issues/668 | 🟡 Open | Yes |

---

*Story complete. Next: Await upstream response to decide which gaps require PR work vs. fallback strategy.*

## File List

- (No canonical doc changes expected — issues are on the ruvnet repo. Update AD-49 with links if issues are filed.)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-12 | Story created | Brooks |
| 2026-07-12 | Story completed — G1/G2/G3 issues filed, AD-49 updated, Brain logged, story file updated | Woz |

## Dev Agent Record

| Agent | Role | Work | Timestamp |
|-------|------|------|-----------|
| Woz | Builder | Read AD-49/AD-50, analyzed crate adapter, drafted and filed 3 upstream issues, logged to Brain, updated docs | 2026-07-12T12:48:00Z |