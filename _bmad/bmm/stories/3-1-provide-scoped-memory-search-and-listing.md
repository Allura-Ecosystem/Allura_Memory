# Story 3.1: Provide Scoped Memory Search and Listing

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD workflow artifact, not a final specification.
> When in doubt, defer to Notion Work Board state, source code, JSON schemas, canonical docs in `docs/allura/`, and team consensus.

## Status

Done

## Story

As an operator,
I want to search and list governed memories within the active tenant scope,
So that I can inspect what the Brain knows without leaking cross-tenant data.

## Traceability

Epic 3 -> FR2, FR4 -> scoped search/list evidence -> `bun test src/agents/memory-wrapper.test.ts src/__tests__/health-metrics-scope.test.ts`

## Acceptance Criteria

- [x] Given an active `group_id`, when memory search runs, then the wrapper validates and carries `group_id` through the controlled retrieval layer.
- [x] Given an active `group_id`, when memory list runs, then the wrapper validates and carries `group_id` through the controlled retrieval layer.
- [x] Search/list responses distinguish episodic traces from approved semantic knowledge using the returned source/store metadata.
- [x] Invalid or missing `group_id` is rejected before canonical storage/query tools are called.
- [x] Allura drift checks compare behavior against prior group-scope and federated-search memory decisions.

## Allura Drift Gate

- Story: `3-1-provide-scoped-memory-search-and-listing — Provide Scoped Memory Search and Listing`
- Brain query: `provide scoped memory search listing blockers decisions outcomes`
- group_id: `allura-system`
- Memory results used:
  - `prop-arch-append-only`: memory operations are append-only; updates version via `SUPERSEDES` rather than mutation.
  - `prop-arch-scope-resolution`: every memory call carries tenant/group/project/agent/session identity.
  - `prop-ad-rrf-hybrid`: hybrid search uses vector + BM25 with explicit modes.
  - `prop-ad-federated-search`: search merges PostgreSQL episodic, Neo4j semantic, and RuVector results; RuVector failure is non-fatal.
  - `mem-ws-neo4j-fallback`: `memory_search` degrades through RuVector, Neo4j, and PostgreSQL fallback paths.
- Compared against:
  - Notion Work Board: unavailable in this runtime; local status remains reconciliation-only.
  - Code/schemas/docs/BMAD plan: `_bmad/bmm/planning/epics.md`, `_bmad/bmm/stories/sprint-status.yaml`, `_bmad/bmm/stories/story-lifecycle-gate.md`, `src/agents/memory-wrapper.ts`, `src/agents/memory-wrapper.test.ts`, `src/mcp/canonical-tools.ts`, `packages/sdk/src/types.ts`, `docs/allura/BLUEPRINT.md`, `docs/allura/DATA-DICTIONARY.md`.
- Drift classification: `minor` — canonical memory search/list can report `graph` and `ruvector` stores, while the SDK response metadata schema only accepts `postgres` and `neo4j`.
- Drift notes: The mismatch can make agent wrapper schema parsing reject truthful canonical metadata even when scoped retrieval succeeds.
- Disposition: proceed; fix metadata contract in this story.
- Owner: Brooks for route; Woz for implementation; Knuth/Pike/Fowler for review.
- Validation commands:
  - `bun test src/agents/memory-wrapper.test.ts`
  - `bun test src/agents/memory-wrapper.test.ts src/__tests__/health-metrics-scope.test.ts`
  - `git diff --check -- src/agents/memory-wrapper.test.ts packages/sdk/src/types.ts _bmad/bmm/stories/3-1-provide-scoped-memory-search-and-listing.md _bmad/bmm/stories/sprint-status.yaml`
- Board traceability: pending; no Notion tool available in this runtime.

## Tasks / Subtasks

- [x] Add RED coverage for scoped search/list metadata returned by canonical memory tools.
  - [x] Confirm wrapper search fails when canonical metadata includes federated stores such as `graph` and `ruvector`.
  - [x] Confirm wrapper list accepts canonical graph-backed metadata while preserving `group_id` and `user_id` routing.
- [x] Update the shared SDK response metadata contract to accept all canonical memory retrieval stores without weakening tenant validation.
- [x] Verify invalid or missing `group_id` is rejected before canonical search/list tools are called.
- [x] Run targeted validation and record exact output.
- [x] Run Pike/Fowler/Knuth gate-equivalent review and resolve blocking findings.

## Dev Notes

- Existing wrapper entry point: `src/agents/memory-wrapper.ts`.
- Existing wrapper tests: `src/agents/memory-wrapper.test.ts`.
- Canonical retrieval implementation: `src/mcp/canonical-tools.ts`.
- Public SDK contract: `packages/sdk/src/types.ts`.
- `validateGroupId` in `src/lib/validation/group-id.ts` already rejects null, undefined, non-string, empty, uppercase, and non-`allura-*` IDs.
- Do not add approval, promotion, deletion, or mutation behavior in this story; Epic 3 is read-only.
- Keep the slice small: contract/test alignment only unless a failing test proves additional behavior is missing.
- Notion remains canonical for board state; local sprint status is reconciliation support only.

## Dev Agent Record

### Implementation Plan

- Follow TDD: RED metadata-contract regression, GREEN shared SDK schema update, REFACTOR only if tests remain green.

### Debug Log

- 2026-05-24: Scout hydration found Story 3.1 in backlog; story file was created from Epic 3.1, Epic 3 was opened locally, and the drift gate searched scoped memory search/list blockers decisions outcomes with `group_id=allura-system`.
- 2026-05-24: RED wrapper test failed because SDK response metadata rejected canonical `graph` / `ruvector` stores in `stores_used` and `stores_attempted`.
- 2026-05-24: Root cause: canonical memory retrieval had evolved to report graph/RuVector metadata, but the public SDK response metadata schema and generated dist artifacts still accepted only `postgres` and `neo4j`.
- 2026-05-24: Review fix: SDK package build was blocked because `tsup` was unavailable (`/usr/bin/bash: line 1: tsup: command not found`), so published `dist` declarations/runtime were updated directly and stale source maps were removed.
- 2026-05-24: Review fix: Added missing and invalid `group_id` pre-call coverage for both search and list.
- 2026-05-24: Knuth subagent invocations returned empty reports in this runtime; Brooks performed a gate-equivalent data/schema review from source and validation evidence.

### Completion Notes

- Added Story 3.1 regression coverage for federated `graph`/`ruvector` metadata through the agent memory wrapper.
- Updated the SDK source and published dist metadata contract to accept canonical stores `postgres`, `neo4j`, `graph`, and `ruvector`, plus `graph_unavailable`, `ruvector_trajectory_id`, and `ruvector_count`.
- Exported `MemoryRetrievalStore` from the SDK public barrel and dist declarations.
- Removed stale SDK dist source maps because the package build tool was unavailable and the maps would otherwise point to old contract content.
- Preserved tenant isolation: tests prove search/list reject missing and invalid `group_id` before canonical tool calls.
- No approval, promotion, delete, or write-path memory behavior was added.
- Validation evidence:
  - RED: `bun test src/agents/memory-wrapper.test.ts` failed with Zod invalid enum errors for `graph` / `ruvector` metadata before the SDK contract fix.
  - GREEN: `bun test src/agents/memory-wrapper.test.ts` passed with `24 pass`, `0 fail`, `35 expect() calls`.
  - `bun run test -- src/__tests__/health-metrics-scope.test.ts` passed with `1 passed` file and `3 passed` tests.
  - `bun run typecheck` passed with `tsc --noEmit` and no TypeScript output after the command line.
  - YAML parse passed.
  - Targeted `git diff --check` produced no output.
- Review evidence: Pike final pass reported no blocking findings for Story 3.1 changed files and one nonblocking `MemoryListParams.user_id` drift note. Fowler final pass reported no blocking findings. Knuth data/schema gate-equivalent found no tenant-scope or mutation concerns; real Knuth subagent returned empty output in this runtime.
- Brain outcome memory: `80f15ac6-3672-48ee-bac7-d9d1e8494311`.
- Notion Work Board update: pending; no authorized Notion tooling is available in this runtime.

## File List

- `_bmad/bmm/stories/3-1-provide-scoped-memory-search-and-listing.md`
- `_bmad/bmm/stories/sprint-status.yaml`
- `packages/sdk/src/index.ts`
- `packages/sdk/src/types.ts`
- `packages/sdk/dist/index.d.ts`
- `packages/sdk/dist/index.d.cts`
- `packages/sdk/dist/index.js`
- `packages/sdk/dist/index.cjs`
- `packages/sdk/dist/index.js.map` (deleted stale source map)
- `packages/sdk/dist/index.cjs.map` (deleted stale source map)
- `src/agents/memory-wrapper.test.ts`

## Change Log

- 2026-05-24: Created story from Epic 3.1 with drift gate and implementation context.
- 2026-05-24: Completed scoped search/list SDK metadata contract alignment and wrapper tenant-scope coverage; local status marked Done pending canonical Notion board sync.
- Brain outcome memory: `80f15ac6-3672-48ee-bac7-d9d1e8494311`.
