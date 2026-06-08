# Story 1.1: Verify Group Scope Enforcement Baseline

Status: done

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this story file were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD execution artifact, not a final specification.
> When in doubt, defer to source code, JSON schemas, canonical docs in `docs/allura/`, Notion board state, and team consensus.

## Story

As a Team RAM builder,
I want a formal schema drift and enforcement-ordering report for governed memory scope,
so that all later memory, proposal, graph, and curator stories build on verified tenant-isolation guarantees instead of assumptions.

## Acceptance Criteria

1. Given `docs/allura/DATA-DICTIONARY.md`, JSON schemas, PostgreSQL init SQL, Neo4j init Cypher, and runtime group validation code are the citable baseline, when the story audits memory/events/proposals/graph enforcement, then it produces a field-by-field compliance matrix comparing DATA-DICTIONARY, SQL DDL, JSON schemas, Neo4j constraints/indexes, and runtime code.
2. The report includes a drift log with severity values `critical`, `major`, or `minor` for every mismatch found.
3. The report includes a reconciliation checklist linking each schema element to its enforcement layer: SQL `NOT NULL`/`CHECK`/FK/index, JSON schema, Neo4j constraint/index, and application validation hook.
4. The report explicitly verifies deployment-path ordering: schema constraint -> index -> API/runtime validation -> targeted test evidence.
5. Any critical drift blocks implementation stories that touch memory, events, proposals, or graph state until resolved or explicitly deferred by Brooks and the data owner.
6. Split validation runs, or any inability to run it is documented as a blocker with exact error output:
   - `bun test src/lib/validation/group-id.test.ts src/lib/graph-adapter/neo4j-adapter.test.ts src/agents/memory-wrapper.test.ts src/lib/memory/__tests__/approval-audit.test.ts`
   - `bun run test -- src/__tests__/health-metrics-scope.test.ts`

## Tasks / Subtasks

- [x] Task 1: Create Story 1.1 execution context and sprint status entry (AC: 1, 6)
  - [x] Create `_bmad/bmm/stories/sprint-status.yaml` with all epics and stories.
  - [x] Mark Epic 1 in progress and Story 1.1 in review after evidence generation.
- [x] Task 2: Produce schema drift and enforcement-ordering report (AC: 1, 2, 3, 4, 5)
  - [x] Compare Data Dictionary, SQL DDL, JSON schema, Neo4j indexes, and runtime validators.
  - [x] Classify drift with `critical`, `major`, or `minor` severity.
  - [x] Identify whether any critical drift blocks later implementation.
- [x] Task 3: Validate Story 1.1 evidence (AC: 6)
  - [x] Run Bun-native split validation.
  - [x] Run Vitest scope validation through Bun script.
  - [x] Run YAML parse and targeted diff checks for generated artifacts.

## Dev Notes

### Architecture and Governance Constraints

- Default tenant is `group_id=allura-system`; every memory operation must carry an explicit `allura-*` namespace.
- Raw memory traces are append-only PostgreSQL events. Semantic knowledge in Neo4j is curated/versioned and must not be mutated directly by agents.
- Notion Work Board remains canonical for human/team status. This local story and sprint file support BMAD reconciliation only.
- `docs/allura/` is restricted to canonical architecture documents plus navigation-only `index.md`. Story artifacts belong under `_bmad/bmm/stories/`.
- Story 1.1 is a governance/audit slice. It does not add product UI and does not authorize autonomous promotion.

### Relevant Source Files

- `_bmad/bmm/planning/epics.md` — source story definition and validation commands.
- `_bmad/bmm/planning/implementation-readiness-report-2026-05-24.md` — readiness status and split-validation decision.
- `docs/allura/DATA-DICTIONARY.md` — canonical field-level documentation baseline.
- `docker/postgres-init/00-traces.sql` — `events` table base DDL and tenant-scoped indexes.
- `docker/postgres-init/11-canonical-proposals.sql` — proposal queue DDL, `trace_ref`, proposal status, audit triggers.
- `docker/postgres-init/19-group-id-check-constraints.sql` — strict group-id format migration across tenant-scoped tables.
- `docker/neo4j-init/00-schema.cypher` — Neo4j `Memory` constraints and group/user indexes.
- `json-schema/event.schema.json` — event payload schema.
- `src/lib/validation/group-id.ts` — application-level group-id validator.
- `src/mcp/canonical-tools.ts` — canonical MCP boundary and memory write path.
- `src/agents/memory-wrapper.ts` — agent-facing memory wrapper validation.
- `src/lib/memory/approval-audit.ts` and `src/lib/memory/__tests__/approval-audit.test.ts` — curator/audit validation surface.
- `src/__tests__/health-metrics-scope.test.ts` — scoped health metrics test that uses Vitest `vi.hoisted`.

### Validation Notes

- Story 1.1 intentionally uses split validation. Bun-native tests cover group-id, graph adapter, memory wrapper, and approval audit units. The health metrics scope test uses Vitest APIs and runs through `bun run test -- ...`.
- If later work changes schema/API/event contracts, update canonical docs and traceability in the same slice.

## Dev Agent Record

### Agent Model Used

openai/gpt-5.5 via Codex runtime under Brooks orchestration

### Debug Log References

- Story 1.1 validation runner decision: Bun-native test subset plus Vitest scope test because `src/__tests__/health-metrics-scope.test.ts` uses `vi.hoisted`.

### Completion Notes List

- Created BMAD sprint tracking file for all Epics 1-5 and marked Story 1.1 as `review` after generating evidence.
- Produced Story 1.1 schema drift and enforcement-ordering report at `_bmad/bmm/stories/1-1-group-scope-enforcement-baseline-report.md`.
- Critical drift assessment: no unresolved critical drift blocks the next story; major/minor drift is documented for follow-up.
- Validation evidence captured in the report: Bun-native split validation passed 82 tests; Vitest scope validation passed 3 tests; YAML parse and targeted `git diff --check` passed.
- Pike and Fowler review blockers were resolved; final read-only re-review reported no blocking findings.

### File List

- `_bmad/bmm/stories/sprint-status.yaml`
- `_bmad/bmm/stories/1-1-verify-group-scope-enforcement-baseline.md`
- `_bmad/bmm/stories/1-1-group-scope-enforcement-baseline-report.md`

### Change Log

- 2026-05-24: Created Story 1.1 execution artifact, sprint status, and enforcement baseline report; moved story to done after validation and read-only Pike/Fowler review.
