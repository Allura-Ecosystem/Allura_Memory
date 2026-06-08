# Story 1.1 Report: Group Scope Enforcement Baseline

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this report were drafted with the assistance of an AI language model.
> Content has not yet been fully reviewed — this is a BMAD validation artifact, not a final specification.
> When in doubt, defer to source code, JSON schemas, canonical docs in `docs/allura/`, Notion board state, and team consensus.

## Scope

This report verifies the current tenant-scope enforcement baseline for governed memory before later memory, proposal, graph, and curator stories proceed.

Story source: [`_bmad/bmm/planning/epics.md`](../planning/epics.md#story-11-verify-group-scope-enforcement-baseline)

## Executive Finding

No unresolved **critical** drift currently blocks the next BMAD story. Tenant isolation is enforced in multiple layers: PostgreSQL constraints, tenant-scoped indexes, runtime validation, agent wrapper validation, and targeted tests.

Known follow-up drift remains:

- **Major:** `json-schema/event.schema.json` accepts a trailing hyphen via `^allura-[a-z0-9-]+$`, while runtime and migration 19 reject trailing hyphens.
- **Major:** `docs/allura/DATA-DICTIONARY.md` summarizes event `group_id` as `^allura-`, which is less precise than migration 19 and runtime validation.
- **Minor:** event type/status enumerations differ between `DATA-DICTIONARY.md`, SQL comments, and `json-schema/event.schema.json`.

These drifts should be reconciled in a dedicated schema/documentation follow-up before schema/API contract claims are treated as final, but they do not remove the active runtime/schema tenant boundary.

## Field-by-Field Compliance Matrix

| Entity / Field | Data Dictionary | SQL DDL / Migration | JSON Schema | Neo4j | Runtime / API | Assessment |
| --- | --- | --- | --- | --- | --- | --- |
| `events.id` | `bigserial`, required | `docker/postgres-init/00-traces.sql`: `id BIGSERIAL PRIMARY KEY` | integer | n/a | `canonical-tools.ts` lets PostgreSQL assign event id and stores UUID memory id in metadata | Aligned |
| `events.group_id` | `varchar(255)`, required, tenant namespace; documented CHECK `^allura-` | `00-traces.sql`: `VARCHAR(255) NOT NULL`; `19-group-id-check-constraints.sql`: strict `^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$` | `^allura-[a-z0-9-]+$` | n/a | `src/lib/validation/group-id.ts`: `^allura-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`; `memory-wrapper.ts` validates before calls | Active enforcement aligned at SQL/runtime; documentation/schema precision drift remains |
| `events.event_type` | Broad list includes memory, proposal, sync, debug, tool, request events | `VARCHAR(100) NOT NULL`; non-empty constraint | Narrow enum: memory add/search/get/list/delete, promotion, session, health | n/a | `canonical-tools.ts` writes `memory_add`; proposal triggers write `proposal_created`/decision events | Minor schema/doc enum drift |
| `events.agent_id` | required | `VARCHAR(255) NOT NULL`; non-empty constraint | string required | n/a | `canonical-tools.ts` derives agent id from metadata/scope or `api`; memory wrapper requires user id on writes/deletes | Aligned |
| `events.status` | `completed`, `failed`, `pending` | `pending`, `completed`, `failed`, `cancelled` | `completed`, `failed`, `pending` | n/a | canonical write path uses `completed` for successful writes | Minor SQL/schema/doc enum drift around `cancelled` |
| `events.metadata` | event-specific payload | `JSONB DEFAULT '{}'::jsonb` | object | n/a | `canonical-tools.ts` records memory id, user id, content, source, conversation id, trace type, scope | Aligned |
| `canonical_proposals.id` | uuid primary key | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | `json-schema/canonical_proposals.schema.json`: string uuid, required | n/a | `canonical-tools.ts` queues proposals for HITL when score meets threshold | Aligned |
| `canonical_proposals.group_id` | required tenant namespace | `11-canonical-proposals.sql`: loose inline `^allura-`; `19-group-id-check-constraints.sql` drops/replaces with strict format | `^allura-[a-z0-9-]+$`, required | n/a | `canonical-tools.ts` validates group id before insert | Active enforcement via migration 19/runtime; JSON precision drift mirrors event schema |
| `canonical_proposals.content` | text, required | `TEXT NOT NULL` | string, required | n/a | `canonical-tools.ts` passes scored memory content into proposal candidate | Aligned |
| `canonical_proposals.score` | numeric confidence score | `11-canonical-proposals.sql`: `DECIMAL(3,2)`; `20-score-precision-fix.sql`: `DECIMAL(4,3)` with 0.0-1.0 CHECK | number, min 0.0, max 1.0, required | n/a | `curatorScore` result controls queue eligibility and stored score | Aligned after migration 20 |
| `canonical_proposals.reasoning` | optional curator reasoning | `TEXT` | string, optional | n/a | `canonical-tools.ts` stores scoring reasoning when proposal is created | Aligned |
| `canonical_proposals.tier` | confidence tier | `VARCHAR(20) NOT NULL CHECK (tier IN ('emerging', 'adoption', 'mainstream'))` | enum present but not listed as required | n/a | `curatorScore` returns tier used by proposal queue | Major schema required-field drift |
| `canonical_proposals.status` | pending/approved/rejected | `VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))` | enum, required | n/a | curator routes/tests cover approval and rejection transitions | Aligned |
| `canonical_proposals.trace_ref` | bigint FK to `events.id` | `BIGINT REFERENCES events(id) ON DELETE SET NULL`; unique partial index | n/a | n/a | `canonical-tools.ts` uses returned event id as trace reference | Aligned |
| `canonical_proposals.created_at` | creation timestamp | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | date-time string, required | n/a | created by database insert path | Aligned |
| `canonical_proposals.decided_at` | decision timestamp | `TIMESTAMPTZ` | date-time string, optional | n/a | curator decision flow populates on approval/rejection | Aligned |
| `canonical_proposals.decided_by` | decision actor | `VARCHAR(255)` | string, optional | n/a | curator decision flow records actor; proposal decision trigger logs to events | Aligned |
| `canonical_proposals.rationale` | decision rationale | `TEXT` | string or null, optional | n/a | curator decision flow records rationale; proposal decision trigger logs to events metadata | Aligned |
| `canonical_proposals.witness_hash` | tamper-evident hash | `13-witness-hash.sql` adds `TEXT`; `20-score-precision-fix.sql` documents SHAKE-256 | string, optional | n/a | curator decision flow/audit validation surface | Aligned |
| `canonical_proposals.notion_page_id` | Notion sync page id | `15-canonical-proposals-notion-page-id.sql` adds `TEXT` and partial index | string, optional | n/a | sync/read paths may populate after Notion sync | Aligned |
| `canonical_proposals.notion_synced_at` | Notion sync timestamp | `15-canonical-proposals-notion-page-id.sql` adds `TIMESTAMPTZ` | date-time string, optional | n/a | sync/read paths may populate after Notion sync | Aligned |
| Neo4j `Memory.group_id` | Memory node includes tenant scope | n/a | n/a | `memory_group_id_idx`; `memory_group_user_idx` | graph adapter tests validate group filters | Indexed; no Neo4j CHECK equivalent |
| Agent wrapper `group_id` boundary | n/a | n/a | SDK contract input | n/a | `memory-wrapper.ts` validates group id before add/search/get/list/delete | Active boundary |
| MCP canonical boundary `group_id` | n/a | n/a | canonical request contracts | n/a | `canonical-tools.ts` calls validation utils at operation boundary | Active boundary |

## Drift Log

| Severity | Drift | Evidence | Impact | Required Follow-up |
| --- | --- | --- | --- | --- |
| major | JSON schema allows trailing hyphen while runtime and migration 19 reject it | `json-schema/event.schema.json` pattern `^allura-[a-z0-9-]+$`; `src/lib/validation/group-id.ts`; `docker/postgres-init/19-group-id-check-constraints.sql` | Schema validation may accept values later rejected by runtime/DB | Align JSON pattern to runtime/SQL or document JSON as intentionally permissive |
| major | Data Dictionary documents `events.group_id` CHECK as `^allura-` instead of strict migration 19 pattern | `docs/allura/DATA-DICTIONARY.md`; `docker/postgres-init/19-group-id-check-constraints.sql` | Human/agent readers may underestimate scope validation strictness | Update Data Dictionary in a schema-doc reconciliation slice |
| major | `canonical_proposals.group_id` JSON schema allows trailing hyphen while runtime and migration 19 reject it | `json-schema/canonical_proposals.schema.json`; `src/lib/validation/group-id.ts`; `docker/postgres-init/19-group-id-check-constraints.sql` | Proposal payload validation may accept values later rejected by runtime/DB | Align proposal JSON pattern to runtime/SQL or document transport/schema distinction |
| major | `canonical_proposals.tier` is SQL-required but not required by JSON schema | `docker/postgres-init/11-canonical-proposals.sql`; `json-schema/canonical_proposals.schema.json` | JSON-valid proposal payload can still fail SQL insert | Add `tier` to JSON `required` list or document why schema permits pre-classified payloads |
| minor | Event type enum differs between Data Dictionary and JSON schema | `docs/allura/DATA-DICTIONARY.md`; `json-schema/event.schema.json` | Schema may reject documented event types if used as strict validator | Reconcile event schema enum with canonical event taxonomy |
| minor | SQL status enum includes `cancelled`, while JSON schema and Data Dictionary omit it | `docker/postgres-init/00-traces.sql`; `json-schema/event.schema.json`; `docs/allura/DATA-DICTIONARY.md` | Status claims are not fully aligned across layers | Decide whether `cancelled` is still valid and update docs/schema |
| minor | Neo4j indexes enforce query performance, not value format | `docker/neo4j-init/00-schema.cypher` | Invalid group ids would need to be blocked before graph writes | Keep runtime validation before graph operations; add graph contract tests if graph writes expand |

## Follow-Up Work Items

| Priority | Follow-up | Owner | Blocks Next Story? |
| --- | --- | --- | --- |
| P1 | Reconcile `json-schema/event.schema.json` `group_id` pattern with migration 19/runtime validation, or document why JSON transport validation remains looser. | Knuth + Woz | No |
| P1 | Reconcile `json-schema/canonical_proposals.schema.json` `group_id` pattern and required `tier` coverage with SQL/runtime behavior. | Knuth + Woz | No |
| P1 | Update `docs/allura/DATA-DICTIONARY.md` to cite the strict migration 19/runtime group-id pattern instead of only `^allura-`. | Knuth + Brooks | No |
| P2 | Reconcile event type/status enum drift between SQL comments, Data Dictionary, and JSON schema. | Knuth | No |

## Enforcement-Order Reconciliation Checklist

| Order | Layer | Evidence | Status |
| --- | --- | --- | --- |
| 1 | `events.group_id` schema constraint | `docker/postgres-init/00-traces.sql` sets `NOT NULL`; `docker/postgres-init/19-group-id-check-constraints.sql` adds strict format CHECK | Present |
| 2 | `events.group_id` index / query scope | `docker/postgres-init/00-traces.sql` adds `idx_events_group_created` | Present |
| 3 | `events.group_id` API/runtime validation | `src/lib/validation/group-id.ts`; `src/mcp/canonical-tools.ts` validates before memory event insert | Present |
| 4 | `events.group_id` wrapper validation | `src/agents/memory-wrapper.ts` validates before add/search/get/list/delete | Present |
| 5 | `events.group_id` targeted tests | `src/lib/validation/group-id.test.ts`; `src/agents/memory-wrapper.test.ts`; `src/__tests__/health-metrics-scope.test.ts` | Present |
| 6 | `canonical_proposals.group_id` schema constraint | `docker/postgres-init/11-canonical-proposals.sql` sets `NOT NULL`; migration 19 replaces loose inline CHECK with strict format CHECK | Present |
| 7 | `canonical_proposals.group_id` JSON schema coverage | `json-schema/canonical_proposals.schema.json` requires `group_id`, but uses looser trailing-hyphen pattern | Present with major drift |
| 8 | `canonical_proposals.tier` JSON schema coverage | `json-schema/canonical_proposals.schema.json` defines tier enum, but does not require it while SQL does | Present with major drift |
| 9 | `canonical_proposals.group_id` index / query scope | `idx_canonical_proposals_pending`; `idx_canonical_proposals_group_date` | Present |
| 10 | `canonical_proposals.group_id` runtime validation | `src/mcp/canonical-tools.ts` validates before proposal creation through `memory_add` | Present |
| 11 | `canonical_proposals.trace_ref` traceability | `trace_ref BIGINT REFERENCES events(id)` and `idx_canonical_proposals_trace_ref_unique` | Present |
| 12 | `canonical_proposals` audit/sync fields | `13-witness-hash.sql`; `15-canonical-proposals-notion-page-id.sql`; `json-schema/canonical_proposals.schema.json` | Present |
| 13 | `Memory.group_id` graph query scope | `docker/neo4j-init/00-schema.cypher` adds `memory_group_id_idx` and `memory_group_user_idx` | Present |
| 14 | graph adapter targeted tests | `src/lib/graph-adapter/neo4j-adapter.test.ts` | Present |

## Blocking Assessment

- **Critical blockers found:** none unresolved.
- **Major follow-ups:** schema/documentation precision drifts should be resolved before declaring schema docs final.
- **Proceed condition for Story 1.2:** allowed after Story 1.1 review, because active enforcement path is present and validation passes.

## Validation Commands

Split validation was run for this story on 2026-05-24.

### Evidence 1 — Bun-native validation

```bash
bun test src/lib/validation/group-id.test.ts src/lib/graph-adapter/neo4j-adapter.test.ts src/agents/memory-wrapper.test.ts src/lib/memory/__tests__/approval-audit.test.ts
```

Result:

```text
bun test v1.3.11 (af24e281)
82 pass
0 fail
198 expect() calls
Ran 82 tests across 4 files.
```

### Evidence 2 — Vitest health metrics scope validation

```bash
bun run test -- src/__tests__/health-metrics-scope.test.ts
```

Result:

```text
RUN  v2.1.9 /media/ronin704/Games/Projects/ai-agents/allura-memory
✓ src/__tests__/health-metrics-scope.test.ts (3 tests)
Test Files  1 passed (1)
Tests  3 passed (3)
```

### Evidence 3 — BMAD YAML validation


```bash
python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('_bmad/bmm/stories/sprint-status.yaml').read_text())"
```

Result: exit 0, no output.

### Evidence 4 — Targeted diff whitespace validation


```bash
git diff --check -- _bmad/bmm/stories/sprint-status.yaml _bmad/bmm/stories/1-1-verify-group-scope-enforcement-baseline.md _bmad/bmm/stories/1-1-group-scope-enforcement-baseline-report.md
```

Result: exit 0, no output.
