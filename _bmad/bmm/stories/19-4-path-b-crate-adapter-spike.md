# Story 19.4 — Path B Crate Adapter Spike

**Status:** blocked (needs Epic 18 done — now unblocked)
**Owner:** Brooks → Woz + Knuth
**group_id:** allura-system
**Epic:** 19

## User Story

As the Allura architect, I need a `ruvector-crate-adapter.ts` implemented behind `GRAPH_BACKEND=ruvector-crate`, so that we have the upstreamable Rust crate adapter as an alternative to the PG-table adapter, per Sabir's Path B choice.

## Context

- Sabir chose Path B (ruvnet Rust crate) on 2026-06-24
- The spike (2026-06-24) verified: crate compiles from source (Rust 1.95, x86_64 Linux), `.node` addon loads under Bun, 8 exports including `GraphDatabase`
- The crate is NOT on npm (G4) — must build/vendor the native `.node` ourselves
- Hard constraints: G1 (no updateNode — SUPERSEDES via createNode+createEdge), G2 (no keyword/BM25 fulltext), G3 (no native multi-tenant scoping), G5 (embedding required on every createNode, properties are Map<String,String>)
- 16-method mapping documented in AD-49 archive draft

## Acceptance Criteria

- [ ] AC-1: `src/lib/graph-adapter/ruvector-crate-adapter.ts` implements all 16 IGraphAdapter methods
- [ ] AC-2: Selected by `GRAPH_BACKEND=ruvector-crate` in factory.ts
- [ ] AC-3: SUPERSEDES immutability enforced — never calls `updateNode` (doesn't exist), uses `createNode` + `createEdge` in a native transaction
- [ ] AC-4: `group_id` is encoded as a property and filtered in every Cypher/traversal (G3 mitigation)
- [ ] AC-5: Every `createNode` includes a 768d embedding (G5 compliance) — use `nomic-embed-text` or equivalent
- [ ] AC-6: Typed fields (score, version, status, confidence) are string-serialized at the adapter boundary and parsed on read (G5 compliance)
- [ ] AC-7: Three-way parity test passes (Neo4j vs PG-table vs crate) — extend `adapter-parity.test.ts`
- [ ] AC-8: A governance AD for vendoring the compiled native `.node` addon is drafted (G4 — Bun-only/zero-trust tension)
- [ ] AC-9: The adapter is thin — upstream fixes (G1 immutable mode, G2 text index, G3 tenant scoping) flow back without adapter changes

## Tasks

1. Read the AD-49 archive draft for the 16-method mapping table
2. Read `src/lib/graph-adapter/types.ts` for the IGraphAdapter interface
3. Read `src/lib/graph-adapter/ruvector-adapter.ts` for the PG-table pattern to follow
4. Build the `.node` addon from the ruvnet crate (or use the pre-built one from the spike)
5. Implement `ruvector-crate-adapter.ts` with all 16 methods per the mapping table
6. Wire into `factory.ts` with `GRAPH_BACKEND=ruvector-crate`
7. Extend `adapter-parity.test.ts` for three-way parity
8. Draft the vendoring AD (AD-50 or next free number)
9. Run parity tests
10. Document results

## Dev Notes

- **This is a spike, not a production cutover.** The goal is to prove the crate adapter works, not to flip the default to it.
- **The crate is v0.1.x** — expect breaking changes. Keep the adapter thin.
- **G4 is the biggest risk** — vendoring a compiled native addon tensions with Bun-only/zero-trust. The AD must resolve this explicitly.

## File List

- `src/lib/graph-adapter/ruvector-crate-adapter.ts` (new — 16 methods)
- `src/lib/graph-adapter/factory.ts` (edit — add ruvector-crate selection)
- `src/lib/graph-adapter/__tests__/adapter-parity.test.ts` (edit — three-way parity)
- `docs/archive/allura/AD-50-vendoring-native-addon.md` (new — governance AD for G4)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-12 | Story created | Brooks |