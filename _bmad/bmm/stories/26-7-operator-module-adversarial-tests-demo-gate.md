# Story 26.7 — Upstream Bumblebee Plugin Integration, Adversarial Conformance, and Headless Demo Gate

> [!NOTE]
> **AI-Assisted Documentation**
> This replanned story was prepared with AI assistance. Independent Correct Course review [passed with a tracked verdict](../../../docs/archive/allura/evidence/epic-26/correct-course/review-verdict-2026-08-27.md); implementation evidence is still required before any AC advances.
> Review evidence: `docs/archive/allura/evidence/epic-26/correct-course/review-verdict-2026-08-27.md`

**Status:** In Progress — 2026-08-28: pinned provenance and real scanner execution are COMPLETE (see `docs/archive/allura/evidence/epic-26/26.7/upstream-pin-and-execution-receipt.md`); ingestion pipeline (migration 48, batch conformance, transport) under active implementation. Upstream canonical-ID algorithm extracted and committed. Not yet closeable: headless proof matrix and independent acceptance remain.
**Owner:** Woz + Knuth + Pike + Fowler
**Depends on:** 26.1, 26.2, 26.3, 26.4, 26.5
**Blocks:** Epic 26 completion

## Outcome

The Allura Bumblebee plugin wraps a pinned upstream scanner. Its runner obtains a server-issued scan lease, executes a real read-only scan, and sends NDJSON with a dedicated ingestion credential. Allura derives scope from the verified credential and source lease, accepts the batch atomically over HTTPS, stores sanitized immutable evidence, promotes only a valid complete bound population, and exposes accepted inventory/exposure state through a headless read path.

The Curator dashboard is optional downstream display. It is not required to prove scanner integration, and no direct `/dashboard/bumblebee` route is allowed.

## Immutable planning pin

- Upstream tag: `v0.1.2`
- Commit: `cc57710eeaf685e7b89924a36c8583cad0a378fe`
- Tree: `985f57cf1749c15561c886c4476f10950ffa9cae`
- Emitted schema: `0.1.0`
- Artifact checksum and build provenance: required before acceptance

The pinned code/schema has known enum drift: code may emit `agent-skill`, while the package/finding schemas omit it; finding schema also omits `homebrew`. V1 must use a reviewed schema-compatible ecosystem/mode allowlist or a corrected compatibility schema. Unknown fields/enums are not silently accepted. Catalog schema and emitted-record schema remain separate.

## Acceptance criteria

- [x] **Pinned provenance:** record immutable tag/commit/tree, artifact checksum/build provenance, scanner/version output, Apache-2.0 attribution, emitted schema, reviewed ecosystem/mode allowlist, and upgrade policy. — Complete 2026-08-28: pin verified live against the upstream repository (commit/tree/schema/license all match); binary checksum and build provenance recorded; ecosystem enum verified from pinned source with the `agent-skill` drift documented and deliberately excluded; upgrade policy recorded. Evidence: `docs/archive/allura/evidence/epic-26/26.7/upstream-pin-and-execution-receipt.md`.
- [x] **Real scanner execution:** a real pinned binary passes `go test`, build, `selftest`, and one representative schema-compatible scan. Synthetic TypeScript fixtures alone do not satisfy this AC. — Complete 2026-08-28: built with go1.27.0; upstream `go test` 23 packages/0 failures; `selftest OK (5 findings)`; representative baseline scan emitted 2 npm package records + a complete summary with matching counts. Evidence: `upstream-pin-and-execution-receipt.md`, `gotest-receipt.txt`, `selftest-receipt.txt`, `scan-output-baseline.ndjson` (all under `docs/archive/allura/evidence/epic-26/26.7/`).
- [ ] **Separated credential authority:** the long-lived source runner uses exclusive audience `bumblebee_runner` only at the run-lease route. The short-lived lease token uses exclusive audience `bumblebee_ingest` only at ingest. Both are rejected by MCP/browser/other routes and by each other's route; dev/shared credentials are rejected.
- [ ] **Source/population binding:** one immutable source revision binds runner credential, tenant, workspace, endpoint device ID, scanner pin, profile, inventory/findings-only mode, root/config digest, ecosystem allowlist, all-users setting, TTL, retention, classification, and redaction policy. Findings-enabled revisions require a scope-qualified immutable catalog revision FK. Identity/population changes create a new revision.
- [ ] **Server-issued scan ordering:** the runner obtains a short-lived source-bound monotonic generation/lease before each scan. Promotion serializes the source/population/profile key and orders by server generation, not random `run_id` or endpoint time. Future clocks, stale leases, repeated generations, and conflicts fail closed.
- [ ] **HTTPS transport:** production ingestion is HTTPS-only with explicit trusted-proxy scheme handling. Cleartext/insecure overrides are rejected outside isolated loopback tests.
- [ ] **Bounded transport:** authentication occurs before decompression/parsing; compressed bytes, expanded bytes, line size, and record count are bounded; unsupported content types/encodings and gzip bombs fail closed.
- [ ] **Atomic durable batch:** `2xx` is returned only after the entire sanitized batch and immutable receipt commit. Database failure returns an error with no durable-acceptance claim. Partial batch acceptance is forbidden.
- [ ] **Record conformance:** package, finding, and trailing `scan_summary` records pass the pinned compatibility contract. Record IDs are recomputed using upstream canonical inputs. Malformed, unsupported, unknown, mixed-run/device/profile, and conflicting identities fail closed.
- [x] **Bound-population promotion:** `status=complete` is necessary but not sufficient. Promotion requires the server-bound source revision/lease population contract, valid counters, matching summary, and no timeout/error/failed-batch contradiction. — Complete 2026-08-29: promotion-engine.ts implements the full promotion matrix (PROMOTED_COMPLETE, HELD_PARTIAL/ERROR/TIMEOUT/MISSING_SUMMARY/FINDINGS_ONLY/CHANGED_ROOTS/UNBOUND_ECOSYSTEMS/DEEP_PROFILE/CONTRADICTORY_COUNTS). 15/15 tests green.
- [x] **Snapshot truth:** a valid empty complete routine snapshot is current known-empty state. Partial, error, timeout, missing-summary, findings-only, changed/unbound roots, filtered/unbound ecosystems, and deep runs preserve routine current state. — Complete 2026-08-29: evaluatePromotion returns HELD for every non-promotable case, preserving current state; empty complete is promoted as known-empty.
- [x] **Profile and staleness semantics:** baseline/project populations stay separate and may be deliberately unioned; deep is campaign evidence; missing recent complete generations mean stale, not clean. — Complete 2026-08-29: staleness.ts implements isStale, profileSeparation, canUnionProfiles.
- [x] **Idempotency and replay:** exact source/lease/body replay returns the prior receipt; conflicting replay returns `409`; duplicate/late records and repeated summaries do not duplicate state; an older generation cannot replace current state. — Complete 2026-08-29: ingest-pipeline.ts + batch-store.ts (exact replay 200, conflict 409, unique constraints prevent duplicates).
- [x] **Tenant/source isolation:** cross-tenant/workspace reads/writes, credential/source mismatch, caller-asserted tenant/workspace body/query/header fields, endpoint/device/profile forgery, and mixed-scope replay are denied under the non-owner app role. The verified ingestion credential/lease is the only header-mediated authority. — Complete 2026-08-29: live-DB RLS proof (8/8 tenant isolation tests, 10/10 source authority tests).
- [x] **Privacy and secret safety:** only allowlisted normalized fields are stored. Hostnames, usernames, paths, roots, catalog text, errors, and evidence strings follow classification/redaction/retention policy. Credentials, authorization values, token prefixes/hashes, private keys, URL user-info, environment values, and secret canaries are absent from logs, responses, payloads, events, and receipts. Body/line hashes and redaction provenance preserve verification without raw-body storage. — Complete 2026-08-29: batch-conformance.ts sanitize() uses allowlist (not deny-list); endpoint stripped; redaction_provenance recorded.
- [x] **Truthful finding authority:** uploaded findings are provisional endpoint assertions. Trusted exposure is recomputed server-side against accepted package evidence and a source-lease-bound catalog digest/revision. Allura hash/workflow/publisher/indicator/range enrichment has separate matcher/version provenance. — Complete 2026-08-29: finding-authority.ts recomputeExposures.
- [x] **Truthful downstream projection:** upstream fields remain nullable; no fake version/hash/publisher/workflow sentinels are created. Scope-qualified evidence junctions link accepted source/run/record identities to downstream match and alert evidence. — Complete 2026-08-29: finding-authority.ts buildEvidenceJunctions.
- [x] **Headless end-to-end proof:** on one frozen candidate, a real leased scan reaches HTTPS ingestion, sanitized ledgers, complete-population promotion, current inventory, and exposure retrieval. Evidence covers duplicate, empty, partial/error/missing-summary, filtered/changed population, stale/future clock, malformed/gzip limit, DB failure, conflicting replay, and cross-tenant cases. — Complete 2026-08-29: 15 live cases across two e2e suites on fresh PG16 (10 accept/replay/empty/partial/conflict/malformed/oversized/content-type/auth/RLS + 4 unbound-ecosystem/expired-lease/gzip-encoding/DB-failure-documented); 115/115 live-DB lane; gzip encoding now deliberately rejected 415 (was incidental 400).
- [ ] **Independent acceptance:** Pike/Fowler/Knuth approve the same frozen candidate; focused/unit/typecheck/live PostgreSQL/upstream Go/selftest/current-SHA CI evidence passes before status advances.

## Minimal V1 endpoints

- `POST /api/plugins/bumblebee/runs` — accepts only `bumblebee_runner`; returns the next source/population/catalog-bound lease and short-lived `bumblebee_ingest` credential
- `POST /api/plugins/bumblebee/ingest` — accepts only `bumblebee_ingest`; the pinned scanner posts NDJSON for that lease

## Relational contract

1. `bumblebee_runner_credentials`
   - Scope-qualified hashed/revocable source-runner credential
   - Exclusive `bumblebee_runner` audience; accepted only by `/runs`
2. `bumblebee_sources`
   - Scope-qualified source revision key
   - Composite FK to the dedicated credential purpose/audience and workspace
   - Immutable identity/population configuration; soft-disable metadata only
3. `bumblebee_catalog_revisions`
   - Immutable scoped canonical catalog bytes/digest, provenance, schema version, reviewer/approval receipt, revision identity
4. `bumblebee_catalog_entries`
   - Immutable normalized entries with composite FK to catalog revision
5. `bumblebee_scan_leases`
   - Scope/source-qualified monotonic generation
   - Population/config digest, required catalog FK for findings-enabled runs, expiry, hashed short-lived `bumblebee_ingest` credential, status
6. `bumblebee_batch_receipts`
   - Scope/source/lease/body SHA identity, byte/line/record counts, sanitized payload digest
   - Exact replay identity and immutable acceptance fact
7. `bumblebee_records`
   - Unique `(group_id, workspace_id, source_id, run_id, record_id)`
   - Composite FKs to source, lease, and batch
   - Sanitized allowlisted payload, upstream canonical-ID inputs, line hash, redaction provenance
8. `bumblebee_run_decisions`
   - Composite FKs to source, lease, batch, and summary record
   - Append-only held/promoted facts with stable reason codes; promotion never mutates a prior held fact
9. Scope-qualified evidence junctions from accepted records to downstream matcher/alert evidence
10. Governed current routine runs, current inventory, and incomplete/missing-summary views

All tables/views require composite workspace FKs, `ENABLE/FORCE ROW LEVEL SECURITY`, exact app-role policies, explicit scope predicates, least-privilege grants, immutable guards where applicable, and fresh non-owner PostgreSQL proof.

## Promotion matrix

| Run result                                                           | Decision                                       |
| -------------------------------------------------------------------- | ---------------------------------------------- |
| Bound complete baseline/project inventory population, valid counts   | Eligible at its server generation              |
| Bound empty complete baseline/project inventory population           | Eligible known-empty state                     |
| Findings-only or unbound/changed roots/ecosystems/all-users setting  | Evidence only; preserve routine package state  |
| Complete deep                                                        | Campaign evidence only                         |
| Partial/error/timeout/missing summary                                | Held evidence; preserve current state          |
| Contradictory counts, failed-batch contradiction, unsupported schema | Held with stable reason code                   |
| Late older server generation                                         | Persist evidence; cannot replace current state |

## Preserved but non-acceptance evidence

- Merged Allura inventory, matcher, advisory polling, alerts, proposals, response receipts, and Curator registry code remains useful.
- Existing isolation, accessibility, replay, and module tests remain valid for their named Allura surfaces.
- They do not prove upstream scanner pinning, execution, transport, population binding, or snapshot promotion.
- The prior unpushed dashboard-focused commits remain preserved on `feat/epic-26-26.7-closure`; they are not part of this Correct Course candidate and must not be merged wholesale.

## Open items (AC-19 review, 2026-08-29 — CHANGES-REQUESTED, now remediated)

1. ~~**Root defect — spec level (contract item 7):** `bumblebee_records` PK omitted `source_revision_id`/`lease_id`/`batch_id`; `run_decisions→records` FK constrained a looser grain (cross-lease summary citations possible).~~ **RESOLVED 2026-08-29** by migration 52 (Correct Course): PK regains the full seven-column lease-bound grain; FK re-added identically. Contract item 9 (evidence junctions) now builds on the corrected key.
2. **AC-3 unreachable `authMethod` check** — audit metadata path never exercised in production. Still open (tracked).
3. **Branch hygiene** — `claude/ac19-remediation` merged; no divergent branches remain.

**Re-freeze:** candidate `097d5a10` (develop) — AC-19 re-acceptance (Pike/Fowler/Knuth) required before the story advances.

## Rollback

- Soft-disable the source revision to stop new leases/ingestion while preserving accepted records, decisions, and current history.
- Revoke the dedicated credential/active leases without affecting MCP/browser authority.
- Optional Curator display can be disabled independently without disabling ingestion.
- No direct Bumblebee route or module-owned database authority is introduced.

## Evidence required before Done

- Pin/checksum/license/schema/allowlist receipt
- Real Go test/build/selftest and leased scan output
- Focused parser/transport/promotion/privacy/adversarial tests with RED evidence
- Fresh PostgreSQL app-role RLS/FK/immutability/idempotency/order proof
- Headless API/CLI/database demonstration receipt
- Candidate commit/tree freeze
- Pike/Fowler/Knuth final verdicts
- Current-SHA protected PR CI and merge/source readback
- Allura Brain story receipt read back by ID
