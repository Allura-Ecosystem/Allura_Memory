# Sprint Change Proposal — Story 26.7 Ingest Write-Path Contradiction

> [!NOTE]
> **AI-Assisted Documentation**
> This proposal was drafted with AI assistance (Claude Code) during a Correct Course run on 2026-08-28.
> Findings below are backed by executed commands and file/line evidence. Independent review is still
> required before Story 26.7 advances; see AC-19.

**Date:** 2026-08-28
**Story:** 26.7 — Upstream Bumblebee Plugin Integration, Adversarial Conformance, and Headless Demo Gate
**Epic:** 26 (Bumblebee Supply-Chain Threat Intelligence)
**Scope classification:** Moderate — Developer-implementable, no epic replan, no PM/Architect escalation
**Mode:** Incremental
**Status:** APPROVED by Sabir 2026-08-28 — routed to Developer agent; Slice 5 is the next dev-story task

---

## 1. Issue Summary

Commit `a05bb94b` (adopted from the stranded `db3dc837`) shipped **two mutually exclusive
implementations of the ingest write path**, and the one wired to the live route was the one the
schema forbids.

Discovered during a code review immediately following the dev-story run that adopted the commit.
The slice was unit-green (92/92, later 93/93) and typecheck-clean at the time of discovery, so
nothing in the automated gates surfaced it.

**Evidence:**

| Artifact | Encoded contract |
| --- | --- |
| `docker/postgres-init/48-bumblebee-ingest-ledger.sql` | `REVOKE ALL … FROM allura_app` + `GRANT SELECT` only; writes via `SECURITY DEFINER` gateway |
| `src/lib/bumblebee/ingest-repository.ts:42,51` | direct `INSERT` as `allura_app` |
| `src/__tests__/bumblebee-ingest.e2e.test.ts:66` | asserts `can_insert: true` |
| `src/lib/bumblebee/__tests__/ingest-migration.test.ts:24` | asserts no INSERT grant exists |

Four artifacts, two contracts. Root cause: a mid-slice pivot to function-gated writes was applied
to the SQL and its unit test, but never to the repository, the e2e, or the decision-writing path.

Two Critical and three High findings followed, plus two further contract violations found while
drafting this proposal that neither the review nor the test suite had caught.

---

## 2. Impact Analysis

**Epic impact:** None. The Epic 26 Correct Course contract (2026-08-27) is correct and unchanged —
the implementation drifted from it. No AC rewrite, no epic rescope, no story renumbering.

**Story impact:** Story 26.7 Slice 4 only. Slices 1–3 (committed, independently reviewed, hosted CI
26/26 at `5bc606e7`) are untouched. Slice 5 gains one explicitly named task.

**Artifact conflicts resolved:** migration 48, `ingest-migration.test.ts`, story 26.7 record.
`bumblebee-ingest.e2e.test.ts` needed no change — its `can_insert: true` assertion becomes correct
as written once grants are restored.

**Technical impact:** Migration 48 is not yet applied to any durable environment, so there is no
data migration and no rollback burden. No API surface change. No downstream consumer change.

---

## 3. Recommended Approach — Direct Adjustment

**Rejected:** Rollback (parsing, sanitization, transport-bounds and HTTPS layers are sound and
well-tested — the defects are confined to the persistence seam). MVP reduction (no scope problem).

**Authority for the chosen direction — repo precedent:**

```
GRANT SELECT, INSERT, UPDATE ON bumblebee_runner_credentials TO allura_app;
GRANT SELECT, INSERT ON bumblebee_catalog_revisions, bumblebee_catalog_entries TO allura_app;
GRANT SELECT, INSERT, UPDATE ON bumblebee_sources TO allura_app;
GRANT SELECT, INSERT ON containment_receipts TO allura_app;
```

Every sibling bumblebee table and the wider repo grant writes directly to `allura_app`.
Migration 48 was the **only** security-definer write gateway in the codebase. The epic contract
requires "exact app-role policies, least-privilege grants" — policies and grants, not a gateway.

---

## 4. Detailed Change Proposals

### 4.1 Migration 48 — restore grants and add the missing INSERT policies `[APPLIED]`

`GRANT SELECT` → `GRANT SELECT, INSERT`; `UPDATE`/`DELETE` remain withheld so the immutability
triggers keep a second line of defence.

Added `bumblebee_run_decisions_insert_scope` and `bumblebee_exposure_evidence_insert_scope`.
**These two tables had SELECT policies only.** Under `FORCE ROW LEVEL SECURITY` the grant alone
would still have denied every insert — a silent RLS denial that would have presented as an
unexplained runtime failure.

### 4.2 Migration 48 — `bumblebee_run_decisions` contract compliance `[APPLIED]`

- Dropped `UNIQUE (group_id, workspace_id, source_id, source_revision_id, lease_id)`. It permitted
  one decision per lease while `bumblebee_batch_receipts` permits many batches per lease, so a
  second batch raised a unique violation and aborted the accept transaction. This made the epic's
  held-then-promoted sequence structurally impossible. `PRIMARY KEY … batch_id` is the correct grain.
- Added `summary_record_id TEXT CHECK (… ~ '^scan_summary:[a-f0-9]{64}$')` — contract item 8
  requires decisions to reference the summary record; no such column existed.
- Added `CHECK (decision = 'held' OR summary_record_id IS NOT NULL)` — enforces AC-10's
  "complete is necessary but not sufficient" at schema level.
- Added composite FK to `bumblebee_records`. `MATCH SIMPLE`, so held facts with a NULL summary
  insert cleanly.

### 4.3 Migration 48 — excise the gateway, complete tenant CHECK `[APPLIED]`

Removed `app.accept_bumblebee_ingest` (112 lines). This **retires two High findings outright**
rather than repairing them: the unvalidated caller-supplied tenant scope (`p_group_id` never
checked against `current_setting`; `SECURITY DEFINER` + `BYPASSRLS` under a superuser definer =
cross-tenant write primitive), and the replay branch returning a non-existent receipt id
(`PERFORM 1 … RETURN p_batch_id`). A dead `SECURITY DEFINER` function carrying a live
`GRANT EXECUTE` is a standing privilege-escalation surface with no compensating benefit.

Added the `group_id ~ '^allura-'` CHECK to `bumblebee_records`, the only one of four tables
missing it and the highest-volume table in the ledger.

### 4.4 `ingest-migration.test.ts` — realign to the corrected contract `[APPLIED]`

Inverted the grant assertions; added negative assertions for `SECURITY DEFINER` and
`accept_bumblebee_ingest`; asserted both new INSERT policies; asserted the per-lease UNIQUE is
**absent**; asserted `summary_record_id` and the promoted-requires-summary CHECK; asserted all
four tables carry the tenant CHECK.

### 4.5 Story 26.7 record `[APPLIED]`

Dev Agent Record, Change Log and Status updated with the correction and its authority.

### 4.6 Decision-engine wiring `[DEFERRED — Slice 5]`

`evaluateIngestDecision` is written and 14 tests green, but has **no production caller**.
Wiring it requires extending the lease `SELECT` (`generation`, `profile`, `mode`), extracting the
`scan_summary` record, mapping sanitized snake_case fields onto `IngestDecisionInput`, and
deriving `errorPresent` from `redactionProvenance.omittedFields` — `error` is stripped from the
stored payload at `ingest.ts:155` and is only recoverable via that indirect signal, which is
undocumented and should be settled deliberately.

This is verbatim the story's own Slice 5 scope and needs its own RED/GREEN coverage for
ACs 10/11/12. Building it inside a change-management workflow would reproduce the exact failure
mode this proposal exists to repair.

---

## 5. Implementation Handoff

**Scope: Moderate** → Developer agent, no backlog reorganization required.

**Verification at time of writing:**

| Gate | Result |
| --- | --- |
| `bun run typecheck` | clean |
| focused bumblebee lane | 93/93 |
| `bun run test:unit` | 2,292 passed / 160 skipped / 0 failed |
| `bun run validate:story-status` | 58 violations, unchanged from baseline (26.7's is a pre-existing header advisory) |
| live-PostgreSQL lane | **NOT RUN** |

**Named open items — these are not closed by this proposal:**

1. **Nothing writes `bumblebee_run_decisions` until Slice 5 lands.** `bumblebee_current_inventory`
   and `bumblebee_current_routine_runs` INNER JOIN that table, so both return zero rows.
   **AC-11 (snapshot truth) and the retrieval half of AC-18 cannot pass.** Pre-existing, not
   introduced here.
2. **The live-database lane has never been run.** Candidate container `allura-267-ingest-woz`
   (127.0.0.1:5551) is up but its database name and credentials are unknown, and
   `scripts/ci/run-live-db-tests.sh` defaults to `POSTGRES_PORT=5432` / `POSTGRES_DB=memory` —
   the append-only Brain ledger. Not run rather than run against a guess. Every change in §4
   is schema-level and therefore **unproven until this executes**.
3. No ingest evidence exists under `docs/archive/allura/evidence/epic-26/26.7/`.
4. AC-19 independent acceptance (Pike/Fowler/Knuth on a frozen candidate) is untouched.

**Success criteria:** live-DB lane green against a throwaway container migrated through 48;
`bumblebee-ingest.e2e.test.ts` passing unmodified; Slice 5 writing decision rows; AC-11/AC-18
retrieval demonstrated headlessly.

**Next action:** `bmad-dev-story` on Slice 5, once live-database access exists.
