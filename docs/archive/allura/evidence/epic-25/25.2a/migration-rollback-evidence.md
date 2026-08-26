# Story 25.2a — Remediation migration and live evidence

**Status:** changes-requested implementation evidence only. This does not alter the review verdict or mark the story Done.

## Disposable authority

- Container: `allura-252a-disposable` only
- Endpoint: `127.0.0.1:55432`
- Server: PostgreSQL 16 / pgvector
- Evidence databases: `memory`, `allura_252a_upgrade`, and `allura_252a_refusal`
- Credentials came only from the disposable container/runtime environment; no live/shared database or secret file was used.

## Reconciled RED → GREEN counts

- **Frozen retrospective RED: 11 observed failures** — 6 focused receipt/projection/inventory regressions, 2 operative-route wiring regressions, 1 original-39 forward-upgrade failure (missing `pgcrypto`), and 2 live receipt fixtures missing the new evidence-set hash.
- Additional final-review TDD REDs exposed false-ready projection provenance, missing promotion-outbox app privilege/RLS wiring, and response/receipt state mismatch; each was observed failing before implementation and is covered below.
- **GREEN (2026-08-25 remediation rerun):** focused retrieval/CLI/receipt/projection/route/Team-RAM lane **41/41** across 8 collected files; authoritative seven-file disposable live runner **43/43**; Story 24.4 receipt/outbox/idempotency compatibility **10/10**. Counts name invocations and do not sum overlapping subsets.

## Original Migration 39 → numbered Migration 40

A fresh `allura_252a_upgrade` database received the ordered files through Migration 39 and an incomplete legacy receipt whose `source_event_id` was null. Migration 40 moved that row losslessly into the no-app-grant archive before validating the current table.

```text
upgrade|current_rows=0|archived_rows=1|all_constraints_valid=t
app_archive_privilege|f
```

The current table therefore contains no incomplete legacy row, and `allura_app` cannot select the archive. The replay key includes proposal version and relational evidence identity; every current check/FK reports `convalidated=true`.

## Fresh install through Migration 40

The live harness applied all **44** ordered migrations to `allura_252a_fresh`.

```text
FRESH_EXIT=0
v040=1
projection=build_state
projection=embedding_model
projection=embedding_model_version
```

Fresh schema and forward-upgrade schema both implement the staged projection contract and Migration-40 retained/promotion family ownership.

## Truthful semantic projection outcomes

The disposable persisted test proves:

1. Relational sources resolve through `canonical_proposals.trace_ref -> events.id`.
2. Governed Markdown is deterministically redacted and persisted once with `build_state='pending_embedding'`, null vector, null model, and null model version.
3. A supplied test embedding result updates the same idempotent row to `ready` with vector `[0.125,-0.5,0.25]`, exact model `test-embedding-model`, and exact version `fixture-v1`.
4. No production path invents embedding provenance.

## Real approval app-role RLS / outbox / receipt proof

`workspace-subgraph-authority.e2e.test.ts` invokes the real `/api/curator/approve` route against a freshly migrated disposable child database through the managed `allura_app` pool. No unrestricted query mock participates.

Verified in the committed transaction:

- proposal transition is exact-workspace scoped and sets `canonical_proposals.approved_memory_id`;
- the canonical proposal transition emits `proposal_approved` with `workspace_id`, and the outbox worker emits `canonical_memory_promoted` with the same workspace;
- canonical `promotion_outbox` has the same group/workspace/proposal/memory and `status='pending'`;
- durable governance receipt has the promoted `memory_id` and `outbox_state='queued'`;
- the API returns exactly the persisted GovernanceReceipt (`outbox_state='queued'`) with no response aliases.

## Retained/promotion family upgrade and quarantine

Migration 40 is the concrete owner for `allura_memories`, `promotion_outbox`, and `promotion_idempotency` workspace upgrades. It adds workspace/scope-state columns, exact app-role workspace policies, and scoped outbox/idempotency uniqueness. Existing NULL-workspace rows are labeled `legacy_quarantined`; no workspace is inferred. New route writes explicitly use `workspace_scoped`.

## Failure-atomic refusal, safe rollback, and reapply

A retained receipt with exact source/proposal scope but a deliberately malformed blank version was created on a disposable Migration-39 schema. Migration 40 refused with exit 3. Transaction rollback left the archive absent, immutable trigger present, and version 040 absent. Repairing the malformed version and rerunning recovered successfully:

```text
refusal_exit=3
refused_state|archive_absent=t|immutable_trigger_present=t|version_040_absent=t
recovered|version_040_present=t|current_rows=1|archived_rows=0|all_constraints_valid=t
```

The recovery SQL remains the explicit destructive rollback boundary; the tested forward recovery repaired source data and reapplied Migration 40 without bypassing validation.

## Final executable verification

```text
Focused retrieval/CLI/receipt/projection/route/Team-RAM lane: 8 files, 41/41 passed
Story 24.4 receipt/outbox/idempotency compatibility lane: 3 files, 10/10 passed
Authoritative disposable PostgreSQL runner: 7 configured files, 43/43 passed
  checkpoint continuation: 2/2
  database tenant/workspace isolation: 4/4
  events immutability: 2/2
  workspace-subgraph authority: 21/21
  auto-curator workspace authority: 1/1
  tenant-table inventory: 12/12
  semantic projection pending -> embedded/idempotent: 1/1
Migration quarantine upgrade + failure-atomic refusal/recovery: passed
Current receipt table: 0 rows, 0 incomplete; all receipt constraints validated
TypeScript: passed
Next production build: passed (pre-existing workspace-root/NFT tracing warnings only)
git diff --check: passed
```

## Recovery and family authority

- Policy-only Migration-39 recovery: `docker/postgres-rollback/39-workspace-policy-remediation.sql`.
- Numbered schema/policy recovery: `docker/postgres-rollback/40-workspace-subgraph-forward-upgrade-recovery.sql`.
- Complete owning sequence: `record-family-migration-plan.md`.
- Sole current durable receipt contract: Story 25.2a `GovernanceReceipt` in `DATA-DICTIONARY.md`; the earlier dashboard summary is explicitly renamed and non-authoritative.
