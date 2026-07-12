# Story 19.5 — Upstream Gaps to ruvnet/RuVector

**Status:** blocked (needs 19.4)
**Owner:** Brooks + Pike
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

- [ ] AC-1: Issues are filed on github.com/ruvnet/RuVector for each gap (G1, G2, G3 at minimum)
- [ ] AC-2: Each issue includes: the gap, the use case (Allura's governed memory), the proposed fix, and whether Allura can contribute a PR
- [ ] AC-3: G1 issue: request an immutable/audit mode flag (or document that createNode+createEdge in a transaction is the intended pattern)
- [ ] AC-4: G2 issue: request a text index or BM25 fulltext capability (or document the Cypher-based search workaround)
- [ ] AC-5: G3 issue: request tenant-scoped graphs or document the property-based filtering pattern
- [ ] AC-6: If Allura can contribute a PR for any gap, the PR is drafted and linked to the issue
- [ ] AC-7: The issues are tracked in Allura Brain (group_id=allura-system) for follow-up

## Tasks

1. Read the AD-49 archive draft for the gap descriptions
2. Read the Path B spike results (19.4) for any additional gaps discovered
3. File G1 issue on ruvnet/RuVector
4. File G2 issue on ruvnet/RuVector
5. File G3 issue on ruvnet/RuVector
6. If a PR is feasible for any gap, draft it
7. Log issues to Allura Brain for tracking
8. Update AD-49 with the upstream contribution status

## Dev Notes

- **Be honest in the issues.** Don't demand — propose. Frame as "here's our use case, here's what we need, here's what we can contribute."
- **License compatibility:** RuVector is MIT. Allura's governance package (if we upstream that too) needs a license decision — AD-48 in the execution plan flagged this as an open question.

## File List

- (No canonical doc changes expected — issues are on the ruvnet repo. Update AD-49 with links if issues are filed.)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-12 | Story created | Brooks |