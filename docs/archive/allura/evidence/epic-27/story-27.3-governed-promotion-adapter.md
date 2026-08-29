# Story 27.3 — Governed Promotion Adapter: Evidence Note

> **STATUS: implemented, unit-verified (RED→GREEN), not committed.**
> Repo HEAD `b147ed17` (branch `develop`). TDD: tests written first (RED:
> suite failed with "Failed to load url ../promotion-adapter … Does the file
> exist?"), then the adapter implemented (GREEN: 15/15 branch tests, full
> unit lane 2392 passed).

## What was built

`src/lib/branch/promotion-adapter.ts` (server-only guard) converts a selected
branch diff into an Allura curator proposal. Promotion means **creating a
curator proposal** — the adapter imports no memory-write module and never
names a canonical semantic store. It writes exactly four table shapes:
`promotion_proposals`, `approval_transitions`, `promotion_receipts`, and
`branch_registry`.

| Function | Purpose |
|---|---|
| `createPromotionProposal` | Inserts a `promotion_proposals` row (status `pending`, entity_type `knowledge`, entity_id = branch_id) + an `approval_transitions` row (`draft`→`pending`, actor_type `agent`), preserving additions/overrides/tombstones, base revision, evidence refs, and actor in metadata/evidence_refs. Deterministic `trace_id` (`promo-<sha256-prefix>`) derived from group/workspace/branch/base/diff. |
| `issuePromotionReceipt` | Inserts the immutable server-issued `promotion_receipts` row (append-only trigger) carrying the full diff, base revision, evidence refs, actor, and trace id. |
| `quarantineBranch` | Upserts `branch_registry` to `quarantined`/`rejected`/`rolled_back` with reason + preserved `diff_snapshot` (JSON) for replay. |
| `buildRollbackPlan` | Deterministic, ordered replay steps from the preserved diff (adds → overrides → tombstones) against the base revision. |

## Acceptance criteria mapping

- **AC-1 (convertible to curator proposal, preserving all fields):** `createPromotionProposal` writes both rows; test "converts a branch diff into a pending curator proposal preserving every field" asserts proposal + transition SQL/params carry entity, status, actor, evidence refs, and metadata `{branch_id, base_revision, diff, actor_id, trace_id}`.
- **AC-2 (no direct canonical mutation):** adapter imports only `node:crypto` + `@/lib/validation/group-id`; import-scan test asserts no `@/lib/memory/`, `@/mcp/canonical-tools`, `@/lib/graph-adapter`, `@/control-plane/syscalls`, `@/lib/neo4j` imports and no `allura_memories`/`graph_memories` references; write-surface test asserts only the four governance tables are named.
- **AC-3 (no self-approval / no browser-synthesized success):** proposal starts `pending`; adapter source contains no `'approved'`/`'rejected'` literals — the curator flow (existing `approveProposal` / approve route) is the only approval path.
- **AC-4 (immutable server-issued receipt):** `promotion_receipts` table (migration 53) is append-only via `app.prevent_promotion_receipt_mutation()` trigger (mirrors `governance_receipts`/`mitigation_receipts`), carries deterministic `trace_id` (`^promo-[a-f0-9]{16}$`), and preserves the diff; test asserts receipt fields + trace id.
- **AC-5 (quarantine + reproducible rollback):** `branch_registry` status enum includes `degraded|expired|rejected|quarantined|rolled_back|active`; quarantine requires reason + preserved diff snapshot (CHECK); `buildRollbackPlan` produces ordered replay steps; tests cover both.
- **AC-6 (rewards/trace cites governed evidence):** every proposal carries `evidence_refs` (event/evidence-request refs) and a deterministic trace id; the receipt binds the accepted diff to that trace id — self-reported success has no receipt.

## Migration 53 (`docker/postgres-init/53-branch-registry.sql`)

- `branch_registry`: tenant-scoped (RLS on `app.current_group_id`, FORCE), workspace as column per ADR-001 (no second RLS axis — asserted by shape test), PK `(group_id, workspace_id, branch_id)`, status enum per planning invariant 8, `retention_expires_at` required for every non-active row (unbounded retention out of scope), quarantine/reject/rollback rows require reason + `diff_snapshot`.
- `promotion_receipts`: immutable (trigger), replay key `(group_id, workspace_id, branch_id, trace_id)`, diff/evidence JSONB shape checks.
- Shape test `src/lib/branch/__tests__/branch-registry-migration.test.ts` (6 tests) pins the relational contract (text-shape only; live-DB lane owns runtime proof).

## Verification receipts

- RED: `vitest run --config vitest.config.unit.ts src/lib/branch/__tests__/promotion-adapter.test.ts` → "Failed to load url ../promotion-adapter … Does the file exist?" (exit 1).
- GREEN: `vitest run --config vitest.config.unit.ts src/lib/branch/__tests__/` → 2 files, 15 tests passed.
- Full unit lane: 142 files passed, 2392 tests passed (6 skipped).
- `npx tsc --noEmit`: 0 errors in `src/lib/branch/**` and `vitest.config.unit.ts`. (5 pre-existing errors remain in untracked `src/lib/branch-eval/` — 27-4 work, outside this story's file-disjoint scope, untouched.)
- `npx eslint` on the three new files: clean (0 problems).

## File-disjoint compliance

Touched: `src/lib/branch/promotion-adapter.ts`, `src/lib/branch/__tests__/promotion-adapter.test.ts`, `src/lib/branch/__tests__/branch-registry-migration.test.ts`, `docker/postgres-init/53-branch-registry.sql`, `vitest.config.unit.ts` (added the `src/lib/branch/**/*.test.ts` glob to the unit lane), this note, and the 27-3 story file. Nothing committed. `src/lib/bumblebee/**`, `src/lib/curator/**`, `src/__tests__/**`, `docker/postgres-init/4x-5x` (existing), `sprint-status.yaml`, and 27-4/27-5/27-6 files untouched.
