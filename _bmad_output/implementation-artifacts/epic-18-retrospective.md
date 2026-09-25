# Epic 18 Retrospective — RuVector Documentation Sync

**Date:** 2026-07-12
**Epic:** 18 — RuVector Documentation Sync
**Status:** Complete
**Owner:** Brooks
**group_id:** allura-system

## What Went Well

1. **Sprint loop executed cleanly.** Six stories, all completed in one session. The BMAD sprint infrastructure (sprint-status.yaml, story files, epics.md) was set up fresh and worked on the first try.

2. **Team RAM dispatch pattern worked.** Woz subagents implemented, Pike/Fowler subagents reviewed. The parallel dispatch of review gates (Pike + Fowler in one message) caught real issues — duplicate heading numbers, verbose summary cells, missing TOC entries, typos.

3. **The code was ahead of the docs.** The biggest discovery was that AD-49 (RuVector graph cutover) is 90% built behind the `GRAPH_BACKEND` flag. The docs said "pgvector bridge, not full RuVector" — correct for the native extension, but silent on the graph adapter. This epic closed that gap.

4. **Cross-referencing caught a real error.** The archived AD-49 draft used "RK-15" for the cutover risk, but RK-15 was already taken ("Approve route connection leak"). The sprint loop caught this and renumbered to RK-32 (next free).

5. **AD-029 vs AD-29 format consistency.** Pike caught that the archive used "AD-029" (leading zero) but canon uses "AD-29". Fixed across all new content.

## What Didn't Go Well

1. **Scout subagent didn't return usable output.** The first Scout dispatch returned empty. I had to do recon myself from my earlier reads. This is a known issue with subagent context windows — the recon brief needs to be more tightly scoped.

2. **Woz subagents claimed "already done" on fix cycles.** On two occasions, Woz reported that fixes were "already applied" when they weren't — or were applied in the same session, not a prior commit. I had to independently verify every claim with `grep` and `git diff --check`. Trust but verify.

3. **Trailing whitespace slipped through.** One story had a trailing whitespace error that Woz didn't catch. I fixed it directly. The `git diff --check` gate needs to be run by Brooks after every Woz cycle, not just trusted to Woz.

4. **Story file naming inconsistency.** Story 18.1 file is named `18-1-promote-ad49-rk15-to-canon.md` but the actual risk number is RK-32, not RK-15. The file name preserves the original draft naming. Not a blocker, but creates confusion.

## Lessons

1. **Verify every subagent claim.** "Already done" is not evidence. Run `grep`, `git diff --check`, and read the actual file state before marking a story done.

2. **Do recon yourself when subagents fail.** The sprint loop doesn't stop because Scout didn't return. Brooks has the context from earlier reads — use it.

3. **The three-layer RuVector distinction is the key insight.** Vector search (pgvector bridge), graph adapter (IGraphAdapter seam), native extension (not yet active). This distinction was conflated in the docs before this epic. Now it's clear.

4. **Archive → canon promotion is the pattern.** AD-49 was drafted in archive, reviewed, then promoted to canon with correct numbering. This is the governed path for all future architecture decisions.

## Action Items

| # | Action | Owner | Status |
|---|--------|-------|--------|
| 1 | Commit the 5 canonical doc changes to allura-memory | Brooks | Pending |
| 2 | Unblocked Epic 19 (RuVector Graph Cutover Execution) — stories 19.1-19.5 can now proceed | Brooks | Ready |
| 3 | Fix story file naming (18-1-promote-ad49-rk15 → 18-1-promote-ad49-rk32) | Brooks | Low priority |
| 4 | Add `git diff --check` as explicit Brooks gate after every Woz cycle | Brooks | Process change |

## Metrics

| Metric | Value |
|--------|-------|
| Stories completed | 6/6 |
| Review cycles | 8 (6 initial + 2 fix cycles) |
| Lines added to canon | 293 |
| Canonical docs updated | 5/6 (DESIGN-ALLURA.md not touched — correct) |
| New AD entries | 1 (AD-49) |
| New RK entries | 1 (RK-32) |
| New REQ entries | 5 (REQ-RV-001..005) |
| Brain outcome traces logged | 6 (one per story) |
| Subagent dispatches | ~15 (Woz × 8, Pike × 4, Fowler × 3) |