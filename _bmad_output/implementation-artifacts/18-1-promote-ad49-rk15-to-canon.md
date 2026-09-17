# Story 18.1 — Promote AD-49 + RK-32 to Canonical RISKS-AND-DECISIONS.md

**Status:** Done
**Owner:** Brooks → Woz
**Dev Agent Record:**
- Agent: Woz
- Build date: 2026-07-12
- Pattern: Woz → PR-ready diff (clean, focused)
**group_id:** allura-system
**Epic:** 18

## User Story

As the Allura architecture owner, I need the RuVector graph cutover decision (AD-49) and its risk (RK-15) promoted from `docs/archive/allura/` into the canonical `docs/allura/RISKS-AND-DECISIONS.md`, so that the 6-file doc set reflects the actual state of the RuVector graph adapter (90% built behind `GRAPH_BACKEND` flag per AD-029).

## Context

- **AD-49** was drafted 2026-06-24 in `docs/archive/allura/AD-49-ruvector-graph-cutover.md`
- It is **AD-33-gated** — promotion to canon requires explicit approval
- The code is ahead of the docs: `RuVectorGraphAdapter` (513 lines), `PostgreSQL (graph_memories)GraphAdapter` (816 lines), `IGraphAdapter` interface, `factory.ts` with `GRAPH_BACKEND` flag (defaults to `PostgreSQL (graph_memories)`)
- Parity test is green: `adapter-parity.test.ts` — 14/14 pass
- Sabir chose **Path B** (ruvnet Rust crate) but **Path A** (PG tables) is recommended for beta ship-now
- AD-47 and AD-48 are already taken in canon (AD-47 = NanoClaw + Vercel AI Gateway, AD-48 = Human Membership as Postgres table)
- **AD-49 is the next free number** — confirmed

## Acceptance Criteria

- [x] AC-1: AD-49 is added to the Architectural Decisions table in `RISKS-AND-DECISIONS.md` with Status = `Proposed`
- [x] AC-2: AD-49 rationale includes: removes per-person graph-auth wall (PostgreSQL (graph_memories) Community = 1 user), collapses two stores toward one engine, self-hosted no license tier
- [x] AC-3: AD-49 references AD-029 (graph adapter pattern — the build) and AD-34 (deferred full RuVector-Postgres migration — this activates it)
- [x] AC-4: AD-49 documents both Path A (PG tables, ship now) and Path B (ruvnet Rust crate, upstreamable) with the recommendation: Path A for beta, Path B in parallel behind same `IGraphAdapter` seam
- [x] AC-9: AI-Assisted Documentation notice is preserved
- [x] AC-10: Cross-references to AD-029, AD-34, RK-21 are present

## Tasks

1. Read `docs/archive/allura/AD-49-ruvector-graph-cutover.md` in full
2. Read the current AD table in `docs/allura/RISKS-AND-DECISIONS.md` (lines 11-63)
3. Read the current RK table in `docs/allura/RISKS-AND-DECISIONS.md` (lines 87-160)
4. Add **AD-49** to the AD table after AD-46 (line 63), with a condensed rationale (the full detail stays in the archive file, cross-referenced)
5. Add **RK-32** (not RK-15 — RK-15 is already taken) to the Risk Summary table after RK-31
6. Add **RK-32** to the Risk Detail table after RK-31 with the 5 sub-risks
7. Add "### AD-49: RuVector Graph Cutover" detail section after AD-48 (after line 417, before the monitoring signals table)
8. Verify all cross-references resolve
9. Run `git diff --check` to verify no whitespace errors

## Dev Notes

- **Do NOT** copy the entire 204-line archive file into canon. The AD table entry should be a condensed version (matching the style of AD-32 through AD-48). The full detail stays in `docs/archive/allura/AD-49-ruvector-graph-cutover.md` and is cross-referenced.
- **Pattern to follow:** Look at how AD-32 (pgvector bridge label) and AD-34 (RVF parked) are written — same style, same density.
- The AD table is a pipe-delimited table. Keep the cell formatting consistent with existing entries.
- **IMPORTANT:** The archived draft used "RK-15" for the RuVector cutover risk, but RK-15 is ALREADY TAKEN in canon ("Approve route connection leak" — ✅ Resolved). The RuVector cutover risk is **RK-32** (next free after RK-31).

## Previous Learnings

- AD-33 gates engine mutation doc changes — this promotion is explicitly the kind of change AD-33 governs. The story assumes approval to proceed; Brooks logs the receipt.
- The archive file was renumbered from AD-47 to AD-49 because AD-47/48 were taken. Do NOT renumber again.

## File List

- `docs/allura/RISKS-AND-DECISIONS.md` (edit — add AD-49 to AD table, add RK-32 to risk tables, add AD-49 detail section)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-12 | Story created | Brooks |
| 2026-07-12 | Promote AD-49 + RK-32 to canonical RISKS-AND-DECISIONS.md | Woz |