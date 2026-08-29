# Story 26.7 — Live PostgreSQL Execution Receipt

> [!NOTE]
> **AI-Assisted Documentation**
> This receipt was assembled with AI assistance (Claude Code) from real command transcripts
> captured on 2026-08-28. The test counts, migration logs, and server version below were
> produced by actual execution against disposable PostgreSQL containers and must be
> independently reviewed with the implementation candidate.

## Scope

First execution of the Bumblebee ingest ledger against a real PostgreSQL instance. Prior to
this, migrations 46/47/48 had never run anywhere: the entire ledger was unit-green but
completely unproven.

**Branch:** `claude/story-26-7-ingestion-a70332` — **superseded.** Story 26.7 is being
delivered on `develop` (`926e744d`) by a parallel session. This evidence is preserved because
it is the only live-database proof produced for this story, and four of its findings still
apply to the canonical implementation.

## Environment

- Image `pgvector/pgvector:pg16`; server reported **PostgreSQL 16.15 (Debian 16.15-1.pgdg12+2)**
- Disposable containers on loopback-bound free ports, one per run, destroyed with
  `docker rm -f -v` afterward. No residue.
- The live Allura Brain ledger (`knowledge-postgres`, port 5432) was **never touched**.
  `scripts/ci/run-live-db-tests.sh` defaults to `POSTGRES_PORT=5432` / `POSTGRES_DB=memory`,
  which is that ledger; every invocation explicitly overrode all connection variables.
- Tests ran as the non-owner role `allura_app`, which is the point — owner-role runs would
  prove nothing about RLS or grants.

## Runs

| Directory | Result | What it establishes |
| --- | --- | --- |
| `run-1-baseline/` | 92 total, 90 passed, **2 failed** | Migrations 1–48 apply cleanly on an empty volume. Two defects exposed. |
| `run-2-after-fixture-and-inventory-fixes/` | 93 total, 92 passed, **1 failed** | Both original defects fixed; fixing the first unmasked a third. |
| `run-3-green/` | **93 total, 93 passed, 0 failed** | Fully green. Authoritative proof. |

Reproduced across independent fresh containers; migrations applied from an empty volume each
time, with only routine idempotent `DROP ... IF EXISTS` notices.

## Defects found

None of these were detectable by the 2,297-test unit suite. Three of the four surfaced
sequentially — fixing one unmasked the next.

1. **Views had no `GRANT` to `allura_app`.** PostgreSQL views are separate ACL objects; a grant
   on a base table does not extend to a view built over it. Any real dashboard or API read of
   `bumblebee_current_inventory` would have returned `permission denied for view`, silently
   defeating AC-11 and the retrieval half of AC-18. **The only production bug of the four.**
   Post-fix ACL confirms `allura_app=r/allura` on all four views.
2. **`bumblebee_run_decisions` and `bumblebee_exposure_evidence` unregistered** in
   `TENANT_TABLE_INVENTORY`. Migration 48 creates both; `validateTenantTableInventory()`
   reported them as unclassified drift. The drift guard caught exactly the drift it exists for.
3. **`run_id: "live-run-1"`** in the e2e fixture can never satisfy `/^[a-f0-9]{32}$/`
   (`ingest.ts:115`), so `persistIngestBatch` was **never reached through the HTTP route**. The
   regex was deliberately not relaxed — the fixture was wrong, not the contract.
4. **Conflict body pretty-printed** with `JSON.stringify(record(), null, 1)`, splitting one
   logical record across 27 physical lines and failing the NDJSON contract with `400` instead of
   reaching the `409` unique-constraint path.

## What run-3 proves

Exercised end to end through the real HTTP route, as `allura_app`, under `FORCE ROW LEVEL SECURITY`:

- Atomic batch acceptance and immutable receipt commit (**AC-8**)
- Exact replay returns the prior receipt; a byte-different body with the same `record_id`
  returns **409** via the `23505` unique-constraint path (**AC-13**)
- Cross-tenant reads/writes denied under the non-owner role (**AC-14**)
- Secret canaries absent from stored payloads; redaction provenance retained (**AC-15**)
- Promoted-path write: `decision='promoted'`, `reason_code='PROMOTED_COMPLETE'`,
  `summary_record_id` matching the summary record — the first exercise of the composite FK
  against `bumblebee_records`' 7-column PK and of
  `CHECK (decision='held' OR summary_record_id IS NOT NULL)` through application code
- `bumblebee_current_inventory` and `bumblebee_current_routine_runs` return real rows

## Evidence boundary

This does **not** close Story 26.7. It proves the write path and four criteria under one
promoted-complete scenario. It does **not** cover AC-11's full matrix (partial, error, timeout,
findings-only, changed population), AC-18's required adversarial cases (empty, stale/future
clock, gzip limit, DB failure), AC-1's missing upgrade policy, or AC-19 independent acceptance.

The unit suite structurally cannot substitute for any of this:
`ingest-repository.test.ts` mocks `client.query` wholesale and therefore cannot detect grant,
RLS, FK, CHECK, or trigger defects, and the views were asserted only as strings inside the SQL
file. That is why all four defects above survived to a live run.

Cross-session findings handed off in Allura Brain trace `aafdcb9a-8aa6-4a0e-91d4-5f53569f37e5`.
