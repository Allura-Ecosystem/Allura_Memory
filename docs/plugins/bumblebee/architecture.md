# Architecture & Data Flow

## Module Structure

The Bumblebee plugin is organized as a single library module under `src/lib/bumblebee/` with HTTP route handlers in `src/app/api/plugins/bumblebee/` and optional UI surfaces in `src/components/bumblebee/`.

```
src/lib/bumblebee/
├── module.ts                 ← Plugin manifest (immutable descriptor)
├── upstream-contract.ts      ← Pinned scanner version + schema + ecosystem allowlists
├── source-authority.ts       ← Source enrollment + route authorization
├── lease-authority.ts        ← Scan lease issuance + token HMAC hashing
├── lease-routes.ts           ← HTTP handler factories + shared error mapping
├── lease-repository.ts       ← Production DB wiring + credential bootstrap
├── batch-conformance.ts      ← NDJSON parsing + record validation + sanitization
├── ingest-pipeline.ts        ← Ingestion orchestration (9-step pipeline)
├── batch-store.ts            ← Atomic batch persistence (receipt + records + decision)
├── promotion-engine.ts       ← 10-check promotion evaluation matrix
├── staleness.ts              ← Profile separation + freshness TTL
├── finding-authority.ts      ← Server-side exposure recomputation + evidence junctions
├── exposure-store.ts         ← DB projection for current packages + catalog + exposures
└── __tests__/                ← 17 test files (unit + migration + live-DB)
```

## Relational Ledger

The plugin owns 10 database tables (all with composite workspace authority, RLS enabled, exact app-role policies):

| Table | Purpose |
|-------|---------|
| `bumblebee_runner_credentials` | Hashed/revocable source-runner credentials (`bumblebee_runner` audience only) |
| `bumblebee_sources` | Immutable source revision identity/population with composite FK to credential + workspace |
| `bumblebee_catalog_revisions` | Immutable scoped canonical catalog bytes/digest, provenance, schema, reviewer/approval receipt |
| `bumblebee_catalog_entries` | Immutable normalized entries with composite FK to catalog revision |
| `bumblebee_scan_leases` | Source-bound monotonic generation, population + catalog-revision FK, hashed short-lived ingest credential |
| `bumblebee_batch_receipts` | Unique source/lease/body identity and atomic acceptance facts |
| `bumblebee_records` | Sanitized append-only records with unique `(group_id, workspace_id, source_id, run_id, record_id)` |
| `bumblebee_run_decisions` | Append-only held/promoted facts; promotion is a new fact, never an update of the held fact |
| `bumblebee_exposure_evidence` | Scope-qualified evidence junctions from accepted records to downstream matcher/alert evidence |
| Views | Current routine runs, current inventory, incomplete/missing-summary operations |

Every table/view requires:
- Composite workspace authority (`group_id` + `workspace_id`)
- `ENABLE` + `FORCE ROW LEVEL SECURITY`
- Exact app-role policies
- Least-privilege grants
- Immutable guards where applicable
- Fresh non-owner PostgreSQL proof

## Data Flow Detail

### Step 1: Lease Issuance

```
Runner (bumblebee_runner credential)
  → POST /api/plugins/bumblebee/runs
    → authenticateBumblebeeRequest(request, "bumblebee_runner")
      → bearer token extraction
      → tokenPrefix() — namespace check (bmb_runner_ vs bmb_ingest_)
      → DB: app.bumblebee_bootstrap_runner(prefix) — look up credential
      → verifyBumblebeeToken() — HMAC-SHA256 timing-safe comparison
      → authorizeBumblebeeRoute() — audience + expiry + revocation + class
    → authenticateRunnerForSource() — verify source revision exists + credential owns it
    → issueScanLease()
      → validate duration (1–300 seconds)
      → authenticateRunner() — re-verify source binding
      → mintIngestToken() — randomBytes(32) → bmb_ingest_<base64url>
      → persistScanLease() — DB: app.issue_bumblebee_scan_lease() → monotonic generation
      → return { leaseId, generation, expiresAt, ingestToken, scope }
```

### Step 2: NDJSON Ingestion

```
Scanner (bumblebee_ingest token from lease)
  → POST /api/plugins/bumblebee/ingest  (HTTPS-only)
    → enforceHttps() — fail closed unless https: / trusted proxy / loopback override
    → authenticateBumblebeeRequest(request, "bumblebee_ingest")
      → same bootstrap flow but app.bumblebee_bootstrap_ingest()
      → authenticateIngestLease() — reconstruct IngestLease from credential row
    → ingestScannerBatch(request, deps)
      (1) Auth before body parse
      (2) Content-Type must be application/x-ndjson
      (2b) Content-Encoding must be identity (no compression)
      (3) Bounded read — Content-Length pre-check + post-read byte check (8 MB max)
      (4) Body SHA-256 = idempotency key
      (5) Replay check — same body hash under same lease → 200 { replayed: true }
      (6) Conflict check — different body under same lease → 409
      (7) parseNdjsonBatch() — conformance validation (see below)
      (8) Atomic persist — receipt + records + held decision in one transaction
      (9) 201 { batchId, accepted: true, recordCount }
```

### Step 3: Conformance Validation

`parseNdjsonBatch()` validates every NDJSON line:

- **Record types**: `package`, `finding`, `scan_summary`, `diagnostic` only
- **Schema version**: must match `0.1.0` exactly
- **Run ID**: hex32 format, all records in a batch must share one run ID
- **Profile**: must match the lease-issued profile
- **Endpoint**: all records must share one endpoint identity (hostname|username)
- **Ecosystems**: must be in both the server-bound allowlist AND the upstream schema allowlist
- **Record ID**: recomputed from canonical inputs (sha256 of type + NUL + RS-joined parts) and compared to declared ID — tampered or truncated IDs are rejected
- **No duplicates**: record IDs must be unique within the batch
- **Exactly one summary**: a batch without a trailing `scan_summary` is a truncated upload
- **Size limits**: 10,000 records max, 1 MB per line, 8 MB body, 64 MB expanded

### Step 4: Promotion Evaluation

`evaluatePromotion()` runs a 10-check matrix:

| # | Check | Held Reason |
|---|-------|-------------|
| 1 | Missing summary | `HELD_MISSING_SUMMARY` |
| 2 | Timed out | `HELD_TIMEOUT` |
| 3 | Error status | `HELD_ERROR` |
| 4 | Partial status | `HELD_PARTIAL` |
| 5 | Deep profile | `HELD_DEEP_PROFILE` |
| 6 | Findings-only mode | `HELD_FINDINGS_ONLY` |
| 7 | Changed roots | `HELD_CHANGED_ROOTS` |
| 8 | Unbound ecosystems | `HELD_UNBOUND_ECOSYSTEMS` |
| 9 | Contradictory counts | `HELD_CONTRADICTORY_COUNTS` |
| 10 | Complete + all checks pass | `PROMOTED_COMPLETE` |

Only a `complete` status with matching summary, roots, ecosystems, and consistent package counts is promoted. Everything else is held as evidence — current inventory is never replaced by incomplete data.

### Step 5: Exposure Recomputation

`recomputeExposures()` matches findings against accepted package inventory:

- **Package index**: built from promoted inventory records, keyed by `(ecosystem, normalized_name)`
- **Version match**: if the finding declares a version, the matched package must carry that same version; null finding versions match by name alone
- **Catalog match**: the finding's `(ecosystem, name, finding_type, advisory_id)` must match a catalog entry whose `affected_versions` includes the matched package's version
- **Catalog digest**: must be bound at lease issuance — without it, ALL findings stay `endpoint-asserted` even if a package name matches
- **No fake sentinels**: null fields (version, catalog_id, advisory_id) stay null — no invented values

Each recomputed exposure produces an `EvidenceJunction` linking back to the exact source/lease/batch/run scope, so downstream alerts are traceable to server-bound context.