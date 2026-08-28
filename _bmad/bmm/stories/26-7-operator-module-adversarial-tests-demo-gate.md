# Story 26.7 — Upstream Bumblebee Plugin Integration, Adversarial Conformance, and Headless Demo Gate

> [!NOTE]
> **AI-Assisted Documentation**
> This replanned story was prepared with AI assistance. Independent Correct Course review [passed with a tracked verdict](../../../docs/archive/allura/evidence/epic-26/correct-course/review-verdict-2026-08-27.md); implementation evidence is still required before any AC advances.
> Review evidence: `docs/archive/allura/evidence/epic-26/correct-course/review-verdict-2026-08-27.md`

**Status:** In Progress — Slices 1–3 committed green (PR #126 head `5bc606e7`); Slice 4 (NDJSON ingest) is the active Dev Story task, resuming from preserved WIP with 2 known RED failures.
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

- [ ] **Pinned provenance:** record immutable tag/commit/tree, artifact checksum/build provenance, scanner/version output, Apache-2.0 attribution, emitted schema, reviewed ecosystem/mode allowlist, and upgrade policy.
- [x] **Real scanner execution:** a real pinned binary passes `go test`, build, `selftest`, and one representative schema-compatible scan. Synthetic TypeScript fixtures alone do not satisfy this AC.
- [ ] **Separated credential authority:** the long-lived source runner uses exclusive audience `bumblebee_runner` only at the run-lease route. The short-lived lease token uses exclusive audience `bumblebee_ingest` only at ingest. Both are rejected by MCP/browser/other routes and by each other's route; dev/shared credentials are rejected.
- [ ] **Source/population binding:** one immutable source revision binds runner credential, tenant, workspace, endpoint device ID, scanner pin, profile, inventory/findings-only mode, root/config digest, ecosystem allowlist, all-users setting, TTL, retention, classification, and redaction policy. Findings-enabled revisions require a scope-qualified immutable catalog revision FK. Identity/population changes create a new revision.
- [ ] **Server-issued scan ordering:** the runner obtains a short-lived source-bound monotonic generation/lease before each scan. Promotion serializes the source/population/profile key and orders by server generation, not random `run_id` or endpoint time. Future clocks, stale leases, repeated generations, and conflicts fail closed.
- [ ] **HTTPS transport:** production ingestion is HTTPS-only with explicit trusted-proxy scheme handling. Cleartext/insecure overrides are rejected outside isolated loopback tests.
- [ ] **Bounded transport:** authentication occurs before decompression/parsing; compressed bytes, expanded bytes, line size, and record count are bounded; unsupported content types/encodings and gzip bombs fail closed.
- [ ] **Atomic durable batch:** `2xx` is returned only after the entire sanitized batch and immutable receipt commit. Database failure returns an error with no durable-acceptance claim. Partial batch acceptance is forbidden.
- [ ] **Record conformance:** package, finding, and trailing `scan_summary` records pass the pinned compatibility contract. Record IDs are recomputed using upstream canonical inputs. Malformed, unsupported, unknown, mixed-run/device/profile, and conflicting identities fail closed.
- [ ] **Bound-population promotion:** `status=complete` is necessary but not sufficient. Promotion requires the server-bound source revision/lease population contract, valid counters, matching summary, and no timeout/error/failed-batch contradiction.
- [ ] **Snapshot truth:** a valid empty complete routine snapshot is current known-empty state. Partial, error, timeout, missing-summary, findings-only, changed/unbound roots, filtered/unbound ecosystems, and deep runs preserve routine current state.
- [ ] **Profile and staleness semantics:** baseline/project populations stay separate and may be deliberately unioned; deep is campaign evidence; missing recent complete generations mean stale, not clean.
- [ ] **Idempotency and replay:** exact source/lease/body replay returns the prior receipt; conflicting replay returns `409`; duplicate/late records and repeated summaries do not duplicate state; an older generation cannot replace current state.
- [ ] **Tenant/source isolation:** cross-tenant/workspace reads/writes, credential/source mismatch, caller-asserted tenant/workspace body/query/header fields, endpoint/device/profile forgery, and mixed-scope replay are denied under the non-owner app role. The verified ingestion credential/lease is the only header-mediated authority.
- [ ] **Privacy and secret safety:** only allowlisted normalized fields are stored. Hostnames, usernames, paths, roots, catalog text, errors, and evidence strings follow classification/redaction/retention policy. Credentials, authorization values, token prefixes/hashes, private keys, URL user-info, environment values, and secret canaries are absent from logs, responses, payloads, events, and receipts. Body/line hashes and redaction provenance preserve verification without raw-body storage.
- [ ] **Truthful finding authority:** uploaded findings are provisional endpoint assertions. Trusted exposure is recomputed server-side against accepted package evidence and a source-lease-bound catalog digest/revision. Allura hash/workflow/publisher/indicator/range enrichment has separate matcher/version provenance.
- [ ] **Truthful downstream projection:** upstream fields remain nullable; no fake version/hash/publisher/workflow sentinels are created. Scope-qualified evidence junctions link accepted source/run/record identities to downstream match and alert evidence.
- [ ] **Headless end-to-end proof:** on one frozen candidate, a real leased scan reaches HTTPS ingestion, sanitized ledgers, complete-population promotion, current inventory, and exposure retrieval. Evidence covers duplicate, empty, partial/error/missing-summary, filtered/changed population, stale/future clock, malformed/gzip limit, DB failure, conflicting replay, and cross-tenant cases.
- [ ] **Independent acceptance:** Pike/Fowler/Knuth approve the same frozen candidate; focused/unit/typecheck/live PostgreSQL/upstream Go/selftest/current-SHA CI evidence passes before status advances.

## Dev Notes

### Architecture guardrails (from Correct Course, merged PR #125)

- Bumblebee is an Allura **plugin** around pinned upstream `perplexityai/bumblebee` v0.1.2 (`cc57710e`). It is not a dashboard authority and gets no direct data route; `/dashboard/bumblebee` must not exist.
- Separate credential audiences: `bumblebee_runner` only at `POST /api/plugins/bumblebee/runs`; `bumblebee_ingest` only at `POST /api/plugins/bumblebee/ingest`. Cross-audience and dev/shared credentials fail closed.
- Server derives principal/tenant/workspace authority; callers cannot assert scope via body/query/header.
- Storage is sanitized allowlisted fields only; no unqualified raw bodies; body/line hashes preserve verification.
- `bumblebee_catalog_revisions` is the immutable catalog ledger; findings-enabled revisions FK to it.
- Promotion serializes on server-issued monotonic generation, never `run_id` or endpoint time.
- Dashboard display is optional; scanner proof must be headless.
- Module code must not own direct storage reads outside the plugin's own governed repository boundary; downstream reads stay behind curator-owned shared read services.

### Current implementation state (verified 2026-08-28)

- Committed on `feat/epic-26-story-26.7-upstream-plugin` (PR #126, head `5bc606e7`, hosted CI 26/26 green):
  - Upstream contract pin + validation tests (`4e91356d`)
  - Go 1.25.7 toolchain; upstream `go test -race` 23 packages; build/selftest/real scan (`6e5451d1`)
  - Source authority + migration 46 (`43b1e444`); lease issuance + migration 47 (`95bf95fe`, `2be355a5`); headless authority composition (`5bc606e7`)
- Uncommitted WIP in the worktree (preserve; do not reset): ingest route/repository/decision, migration 48, live-DB E2E, lease hardening.
- Known RED failures to fix first:
  1. `src/lib/bumblebee/__tests__/ingest-migration.test.ts` expects `line_count INTEGER NOT NULL` in migration 48.
  2. `src/lib/bumblebee/__tests__/ingest-repository.test.ts` rollback test expects stable `BUMBLEBEE_INGEST_RECORD_CONFLICT`, currently returns raw `duplicate`.

### Verification commands

- Focused: `bun vitest run src/lib/bumblebee`
- Full unit: `bun run test:unit`
- Typecheck: `bun run typecheck`
- Live DB: fresh pgvector/pgvector:pg16 container (use `-v` on remove), migrations through 48, `vitest.config.live-db.ts` lanes; destroy container+volume afterward
- Route security: repository route inventory guard (CI `route-to-agents` / local equivalent)
- Story status guard: `bun run validate:story-status` (56 pre-existing legacy violations in Epics 18–24 are out of scope)

## Tasks / Subtasks

### Slice 1 — Upstream contract pin (AC: Pinned provenance)

- [x] Pin validation module rejects empty filters, enum drift (`agent-skill`/`homebrew`), and emits stable non-reflective failure codes (`src/lib/bumblebee/upstream-contract.ts`, `__tests__/upstream-contract.test.ts`, 12/12 green) — commit `4e91356d`
- [x] Record immutable tag/commit/tree and emitted schema in story + code contract tests

### Slice 2 — Real scanner execution (AC: Real scanner execution)

- [x] Go 1.25.7 toolchain installed; upstream `go test -race ./...` 23 packages pass — commit `6e5451d1`
- [x] Bumblebee binary builds; `bumblebee version` correct; `selftest` exits 0 with 5 findings; one real restricted scan produces package record + summary

### Slice 2 — Source/population authority (ACs: Separated credential authority, Source/population binding)

- [x] Migration 46 `bumblebee_sources` immutable identity/population binding with exclusive `bumblebee_runner` audience (migration 46, `source-authority.ts`, `source-authority.test.ts`)
- [x] Dev/shared/foreign credentials and cross-audience use rejected; route security list updated — commit `43b1e444`
- [x] Blank-identity SQL constraints covered by app-role live DB tests; fresh PostgreSQL 82/82 passed — Knuth GO

### Slice 3 — Server-issued scan leases (AC: Server-issued scan ordering)

- [x] Migration 47 `bumblebee_scan_leases` with scope/source-qualified monotonic generation and hashed short-lived ingest credential (`47-bumblebee-scan-leases.sql`, `lease-*.ts`)
- [x] Server-created leases; revoked-runner race safety; app role cannot create leases directly; safe error surfaces — commits `95bf95fe`, `2be355a5`
- [x] Headless plugin authority composition; PR #126 26/26 hosted checks green at `5bc606e7`

### Slice 4 — NDJSON ingest receiver (ACs: HTTPS transport; Bounded transport; Atomic durable batch; Record conformance)

- [x] RED: migration 48 must define `line_count INTEGER NOT NULL` on batch receipts/records (test `ingest-migration.test.ts` currently failing)
- [x] GREEN: add missing column to `docker/postgres-init/48-bumblebee-ingest-ledger.sql`; migration test passes
- [x] RED→GREEN: repository rollback returns stable `BUMBLEBEE_INGEST_RECORD_CONFLICT` code instead of raw driver error (`ingest-repository.ts`)
- [x] HTTPS-only production ingress with trusted-proxy scheme handling; cleartext rejected outside isolated loopback tests
- [x] Authenticate/authorize (`bumblebee_ingest` only) before consuming body; compressed/expanded/line/record bounds; gzip bombs and unsupported encodings fail closed
- [x] Strict NDJSON record conformance: package/finding/`scan_summary` against pinned contract; recomputed record IDs; malformed/unknown/mixed-identity fail closed
- [x] Atomic all-or-nothing batch + immutable receipt commit; DB failure yields no durable-acceptance claim; partial acceptance forbidden

### Slice 5 — Promotion, snapshot truth, replay (ACs: Bound-population promotion; Snapshot truth; Profile/staleness; Idempotency and replay)

- [x] Promotion decision engine (`ingest-decision.ts`): complete-bound promotes at generation; empty-complete = known-empty; findings-only/deep/partial/error/timeout/missing-summary hold evidence and preserve current state; contradictory counts/failed-batch held with stable reason codes
- [x] Exact replay returns prior receipt; conflicting replay `409`; duplicate/late records and repeated summaries never duplicate state; older generation cannot replace current state
- [ ] Profile/staleness semantics: baseline/project separate with deliberate union; deep = campaign evidence; missing recent complete generations = stale, not clean — **NOT implemented this slice.** This is retrieval/read-API behavior (no such endpoint exists yet); wiring `evaluateIngestDecision` into `persistIngestBatch` (the write path) does not touch it. Left open for the slice that adds the current-inventory/current-routine-runs read surface.

### Slice 6 — Isolation, privacy, finding authority (ACs: Tenant/source isolation; Privacy and secret safety; Truthful finding authority; Truthful downstream projection)

- [ ] Non-owner app-role denials: cross-tenant/workspace, credential/source mismatch, caller-asserted scope fields, forged device/profile, mixed-scope replay
- [ ] Allowlisted normalized fields only; secrets/canaries absent from logs, responses, payloads, events, receipts; body/line hashes + redaction provenance preserved
- [ ] Findings stored as provisional endpoint assertions; trusted exposure recomputed server-side against accepted packages + lease-bound catalog digest; no fake sentinels; scope-qualified evidence junctions

### Slice 7 — Headless end-to-end proof (AC: Headless end-to-end proof)

- [ ] Live E2E: real leased scan → HTTPS ingest → sanitized ledgers → complete-population promotion → current inventory + exposure retrieval, headless
- [ ] Adversarial cases covered: duplicate, empty, partial/error/missing-summary, filtered/changed population, stale/future clock, malformed/gzip limit, DB failure, conflicting replay, cross-tenant
- [ ] Fresh disposable PostgreSQL (new container+volume) through migration 48; RLS/FK/immutability/idempotency/order proof; container destroyed afterward

### Slice 7 — Full verification and story record

- [ ] Focused `bun vitest run src/lib/bumblebee` all green; full unit suite; typecheck; changed-file lint; route security check; `git diff --check` clean
- [ ] File List, Dev Agent Record, Change Log updated truthfully; no AC checked without evidence

### Slice 8 — Independent acceptance (post-Dev-Story)

- [ ] BMad Code Review + Pike/Fowler/Knuth verdicts on the frozen candidate
- [ ] Remediation cycles (max 2) for confirmed findings, then re-review
- [ ] Commit, push PR #126 head, current-SHA hosted CI green, protected merge, origin/main readback
- [ ] Sprint status + story status advanced only with evidence; Allura Brain story receipt read back by ID

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

## Dev Agent Record

### Debug Log

- 2026-08-27: First slice started on dedicated branch from Correct Course commit `822a5311`; upstream contract tests 12/12 green (RED phases observed in implementation job, not yet committed as artifact).
- 2026-08-28 ~00:00: Source-authority slice completed after HITL-authorized third remediation; fresh PostgreSQL 82/82; Knuth PASS; PR #126 green.
- 2026-08-28 ~00:35–01:00: Scan-lease slice remediation completed (app-role lease creation blocked, revoked-runner race, safe errors, route inventory) — 94 focused / 2,209 unit / 90 live / 26 hosted checks green at `5bc606e7`.
- 2026-08-28 ~00:54: NDJSON ingest slice started; run interrupted without terminal result; WIP preserved uncommitted.
- 2026-08-28 ~05:29: Sole-writer continuation interrupted by user STOP before any commit; WIP unchanged, no review/merge performed.
- 2026-08-28 ~06:20: BMad normalization of this story (Tasks/Subtasks, Dev Notes, Dev Agent Record, File List, Change Log) completed before Dev Story resume.
- 2026-08-28 ~18:30: Slice 4 WIP located as commit `db3dc837` on `backup/epic-26-26.7-ingest-wip` (already on origin; based on `3486654e`, 20 commits behind main). Cherry-picked clean onto this story branch as `a05bb94b` — no reimplementation, migration slot 48 stays single-authored.
- 2026-08-28 ~18:36: Both REDs recorded above were already resolved inside `db3dc837`: `line_count INTEGER NOT NULL` present (migration 48 line 18, asserted green by `ingest-migration.test.ts`), and `23505` → `BUMBLEBEE_INGEST_RECORD_CONFLICT` mapped at `ingest-repository.ts:64` with rollback + unknown-error tests.
- 2026-08-28 ~18:36: NEW DEFECT — the adopted commit was test-green (92/92) but failed `tsc` with 6 errors, one in production code: `lease-routes.ts(45,7) TS2322`, `Authentication` union not assignable to `{ rawToken: string }`. Root cause was not a type nit: `createIngestHandler` guards the mirror case (`if (!("leaseId" in authenticated)) throw ...credentialClass`) but `createRunsHandler` had no equivalent, so a lease-bound ingest authority arriving at `/runs` was never rejected by credential class — a real AC-3 gap.
- 2026-08-28 ~18:38: RED captured — with the guard removed, the new test fails `TypeError: Cannot read properties of undefined (reading 'sourceId')` at `lease-routes.ts:55`, proving the ingest authority passed authentication and reached body parsing. GREEN after adding the mirror guard. Two test-only type errors also fixed (typed `persist` mock parameter; removed excess `rawToken` from a `BoundIngestAuthority` literal).
- 2026-08-28 ~18:39: Verification — focused bumblebee lane 93/93; full unit regression 2,292 passed / 160 skipped / 0 failed; `bun run typecheck` clean.
- 2026-08-28 ~18:45: Live-database lane NOT run (see Completion Notes blocker).
- 2026-08-28 ~19:10: Code review of `a05bb94b` returned 2 Critical / 3 High. Critical: (1) migration 48 revoked INSERT from `allura_app` while `persistIngestBatch` issues direct INSERTs — the write path could not execute against a real database; (2) `app.accept_bumblebee_ingest` had zero production callers, so `bumblebee_run_decisions`/`bumblebee_exposure_evidence` were never written and `ingest-decision.ts` was dead code.
- 2026-08-28 ~19:30: Correct Course run. Authority for the fix is the epic contract plus repo precedent — every sibling table (`bumblebee_sources`, `bumblebee_catalog_revisions`, `bumblebee_runner_credentials`, `containment_receipts`, `inventory_records`) grants writes directly to `allura_app`; migration 48 was the only security-definer gateway in the repo. Decision: drop the gateway.
- 2026-08-28 ~19:35: Two further contract violations found while drafting, missed by both the review and the tests — `bumblebee_run_decisions` had a per-lease `UNIQUE` making the epic's held-then-promoted sequence impossible, and no `summary_record_id` column despite contract item 8 requiring decisions to reference the summary record.
- 2026-08-28 ~19:40: Applied — grants restored to `SELECT, INSERT` with the two missing INSERT RLS policies (without them `FORCE ROW LEVEL SECURITY` would have denied every insert despite the grant); per-lease UNIQUE dropped; `summary_record_id` + `CHECK (decision = 'held' OR summary_record_id IS NOT NULL)` + composite FK added; security-definer gateway excised (112 lines), which retires the unvalidated-caller-scope and wrong-replay-id findings outright; `group_id` tenant CHECK added to `bumblebee_records`; migration test realigned to the corrected contract.
- 2026-08-28 ~20:15: Slice 5 started. `ingest-decision.ts`: `IngestDecisionInput.summary` widened to `IngestDecisionSummary | null` and a new `HELD_MISSING_SUMMARY` reason added — a batch with no trailing `scan_summary` record can never be evaluated against the promotion matrix, so it must hold with its own stable code rather than being force-fit into an existing one. Pinned by a new `ingest-decision.test.ts` case.
- 2026-08-28 ~20:20: `ingest-repository.ts` `persistIngestBatch`: lease `SELECT` extended to fetch `generation, profile, mode, created_at`; after the records loop (never before — `summary_record_id` is a composite FK against `bumblebee_records`, so the referenced row must already exist in the same transaction), the batch's `scan_summary` record (if any) is located, `packageRecords`/`findingRecords` are counted from `batch.records`, `databaseNow` is read from `SELECT statement_timestamp()` (not `Date.now()`), `evaluateIngestDecision` is called, and the resulting `{decision, reasonCode}` plus `summaryRecord.recordId ?? null` are inserted into `bumblebee_run_decisions`. The exact-replay early return (line 39, pre-existing) is untouched and still short-circuits before any of this runs, so a replayed body issues zero additional queries and can never attempt a second decision INSERT (PK is one row per `batch_id`).
- 2026-08-28 ~20:25: `errorPresent` derivation implemented per spec: `summaryRecord.redactionProvenance.omittedFields.includes("error")`. This is coupled to `ingest.ts` `sanitizeRecord`'s scan_summary branch, which only lists `"error"` in `omittedFields` when the raw record actually carried `error !== undefined`. Documented inline at the call site and pinned by a dedicated repository test (`derives errorPresent from redactionProvenance omission and holds the contradiction`) that round-trips a real record through `parseIngestRequest` and asserts both the omission and the resulting `HELD_ERROR_CONTRADICTION` decision.
- 2026-08-28 ~20:30: Knuth gap closed — added `bumblebee_run_decisions_promoted_idx` (partial index, `WHERE decision = 'promoted'`) to migration 48, asserted by `ingest-migration.test.ts`.
- 2026-08-28 ~20:35: Verification — focused bumblebee lane 98/98 (was 93/93, +5: 1 decision-engine case, 4 repository wiring cases); full unit regression 2,297 passed / 160 skipped / 0 failed (was 2,292/160/0, +5, no regressions); `bun run typecheck` clean.
- 2026-08-28 ~20:35: Live-database lane NOT run — same blocker as before (candidate container `allura-267-ingest-woz` credentials unknown; no `.env` in this worktree; the CI script default points at the live append-only Allura Brain ledger). No live-DB proof of the FK ordering, the partial index, or the promoted/held rows landing in `bumblebee_current_inventory` / `bumblebee_current_routine_runs` exists yet.

### Completion Notes

- Slices 1–3 are committed and independently reviewed green (Pike/Fowler/Knuth PASS; hosted CI 26/26 at `5bc606e7`).
- Slice 4 WIP is no longer uncommitted: adopted as `a05bb94b`. Both previously recorded REDs were already resolved inside it; the outstanding "typecheck not yet verified" item was run and found **failing**, and is now fixed.
- Slice 4 code items are complete and unit-covered: HTTPS-only ingress with `BUMBLEBEE_TRUST_PROXY` / `x-forwarded-proto` handling (`ingest.ts:167-169`), authenticate-before-body, compressed/expanded/line/record bounds, gzip and encoding gating, strict NDJSON conformance with recomputed record IDs, and all-or-nothing commit via `app.accept_bumblebee_ingest`.
- **AC-2 advanced.** `docs/archive/allura/evidence/epic-26/26.7/upstream-v0.1.2/` carries real execution matching the criterion text exactly: `go test -race ./...` 23 packages exit 0, build exit 0 (binary SHA-256 `19e3e4a4…`), `bumblebee selftest` → `selftest OK (5 findings in 2ms)` exit 0, and one representative npm scan exit 0 emitting schema `0.1.0` with summary status `complete`.
- **AC-1 deliberately NOT advanced.** Its receipt covers tag/commit/tree, artifact checksum, build provenance, version output, Apache-2.0 attribution, emitted schema, and the reviewed ecosystem/mode allowlist — but documents no **upgrade policy**. That one element is the only gap.
- **AC-3 deliberately NOT advanced** despite the gap being closed and unit-green: the criterion also requires rejection by MCP/browser/other routes and of dev/shared credentials, which lives in the un-run live-PostgreSQL half.
- **BLOCKER — live-database lane not run.** ACs 4 and 6–18 require fresh non-owner PostgreSQL proof. `vitest.config.live-db.ts` includes `src/__tests__/bumblebee-ingest.e2e.test.ts`, and a candidate container `allura-267-ingest-woz` (127.0.0.1:5551) is running, but this worktree has no `.env` and that container's database name and credentials are unknown. `scripts/ci/run-live-db-tests.sh` defaults to `POSTGRES_PORT=5432` / `POSTGRES_DB=memory` — the live Allura Brain ledger, whose event tables are append-only, so a wrong target pollutes it permanently. The lane was therefore not run rather than run against a guess. No ingest evidence exists yet under `docs/archive/allura/evidence/epic-26/26.7/`.
- **Slice 5 wiring done, unit-provable only.** `evaluateIngestDecision` is no longer dead code: `persistIngestBatch` now inserts one `bumblebee_run_decisions` row per non-replayed batch, sequenced after the records loop (satisfies the `summary_record_id` composite FK), sourced from the lease row (`generation, profile, mode, created_at`), the batch's own records (`packageRecords`/`findingRecords` counts, the `scan_summary` record if present), and `SELECT statement_timestamp()` for `databaseNow`. Covered by 4 new `ingest-repository.test.ts` cases (promoted-complete with correct sequencing/params, empty-complete known-empty promotion per AC-10, `HELD_MISSING_SUMMARY` with a null `summary_record_id` when no `scan_summary` arrives, and the `errorPresent` coupling pinned via a real `parseIngestRequest` round-trip) plus 1 new `ingest-decision.test.ts` case for the new `HELD_MISSING_SUMMARY` reason. **What remains unproven:** whether the actual Postgres FK/CHECK constraints in migration 48 accept these exact INSERT shapes (column types, the `summary_record_id` regex, the composite FK resolution) can only be confirmed against a real database — the live-DB blocker above applies equally here. AC-11 (current inventory) and the retrieval half of AC-18 still cannot be marked Done without that proof; this session only removes the "nothing writes this table at all" defect.
- **AC item "Profile/staleness semantics" (Slice 5, third bullet) intentionally NOT touched.** It describes read-side behavior (baseline/project union, deep-as-campaign-evidence, staleness-from-missing-generations) that has no corresponding endpoint yet — there is nothing in the current codebase that reads `bumblebee_current_inventory`/`bumblebee_current_routine_runs` for an operator. Wiring the write-path decision engine does not implement it; left open, not silently claimed.
- **Knuth's partial-index gap closed.** Added `bumblebee_run_decisions_promoted_idx` to migration 48 and asserted it in `ingest-migration.test.ts`. This is schema-only and unproven against a live planner (no `EXPLAIN` evidence possible without the live-DB lane).

## File List

Committed on `feat/epic-26-story-26.7-upstream-plugin`:

- `src/lib/bumblebee/upstream-contract.ts`
- `src/lib/bumblebee/__tests__/upstream-contract.test.ts`
- `src/lib/bumblebee/source-authority.ts`
- `src/lib/bumblebee/__tests__/source-authority.test.ts`
- `src/lib/bumblebee/lease-authority.ts`
- `src/lib/bumblebee/lease-repository.ts`
- `src/lib/bumblebee/lease-routes.ts`
- `src/lib/bumblebee/lease-routes.test.ts` (via `src/lib/bumblebee/__tests__/`)
- `src/lib/bumblebee/module.ts`
- `src/lib/bumblebee/__tests__/module.test.ts`
- `src/lib/bumblebee/__tests__/scan-lease-migration.test.ts`
- `docker/postgres-init/46-bumblebee-source-authority.sql`
- `docker/postgres-init/47-bumblebee-scan-leases.sql`

Adopted as commit `a05bb94b` (cherry-pick of `db3dc837`), no longer uncommitted:

- `docker/postgres-init/48-bumblebee-ingest-ledger.sql` (new)
- `src/app/api/plugins/bumblebee/ingest/route.ts` (modified)
- `src/lib/bumblebee/ingest.ts` (new)
- `src/lib/bumblebee/ingest-repository.ts` (new)
- `src/lib/bumblebee/ingest-decision.ts` (new)
- `src/lib/bumblebee/lease-repository.ts` (modified)
- `src/lib/bumblebee/lease-routes.ts` (modified)
- `src/lib/db/tenant-table-inventory.ts` (modified)
- `vitest.config.live-db.ts` (modified)
- `src/__tests__/bumblebee-scan-leases.e2e.test.ts` (modified)
- `src/__tests__/bumblebee-ingest.e2e.test.ts` (new)
- `src/lib/bumblebee/__tests__/ingest-binding.test.ts` (new)
- `src/lib/bumblebee/__tests__/ingest-decision.test.ts` (new)
- `src/lib/bumblebee/__tests__/ingest-migration.test.ts` (new)
- `src/lib/bumblebee/__tests__/ingest-repository.test.ts` (new)
- `src/lib/bumblebee/__tests__/ingest-routes.test.ts` (new)

Changed in this Dev Story session (on top of `a05bb94b`):

- `src/lib/bumblebee/lease-routes.ts` (modified — `/runs` credential-class guard, AC-3 mirror)
- `src/lib/bumblebee/__tests__/lease-routes.test.ts` (modified — added `/runs` lease-authority rejection test)
- `src/lib/bumblebee/__tests__/ingest-routes.test.ts` (modified — typed `persist` mock parameter)
- `src/lib/bumblebee/__tests__/ingest-repository.test.ts` (modified — removed excess `rawToken`)
- `_bmad/bmm/stories/26-7-operator-module-adversarial-tests-demo-gate.md` (modified — this record)

Slice 5 (this session, on top of the above):

- `src/lib/bumblebee/ingest-decision.ts` (modified — `IngestDecisionSummary` extracted; `summary` now `IngestDecisionSummary | null`; new `HELD_MISSING_SUMMARY` reason and early check)
- `src/lib/bumblebee/ingest-repository.ts` (modified — lease `SELECT` extended with `generation, profile, mode, created_at`; decision-engine call and `bumblebee_run_decisions` INSERT wired in after the records loop)
- `src/lib/bumblebee/__tests__/ingest-decision.test.ts` (modified — added `HELD_MISSING_SUMMARY` case)
- `src/lib/bumblebee/__tests__/ingest-repository.test.ts` (modified — added `packageRecord`/`summaryRecord`/`parseBatch`/`decisionClientMock`/`decisionInsertCall` helpers and 4 new decision-wiring tests: promoted-complete sequencing, empty-complete known-empty, missing-summary hold, errorPresent-coupling hold)
- `docker/postgres-init/48-bumblebee-ingest-ledger.sql` (modified — added `bumblebee_run_decisions_promoted_idx` partial index)
- `src/lib/bumblebee/__tests__/ingest-migration.test.ts` (modified — asserts the new partial index)
- `_bmad/bmm/stories/26-7-operator-module-adversarial-tests-demo-gate.md` (modified — this record)

## Change Log

- 2026-08-27: Story replanned under Correct Course (PR #125); ACs corrected to upstream-plugin architecture; review verdict evidence tracked.
- 2026-08-28: BMad normalization — added Dev Notes (architecture guardrails, current state, verification commands), Tasks/Subtasks (Slices 1–8), Dev Agent Record, File List, Change Log sections per bmad-dev-story requirements. No ACs advanced; implementation state recorded truthfully.
- 2026-08-28: Adopted stranded Slice 4 ingest ledger commit `db3dc837` onto the story branch as `a05bb94b` rather than reimplementing it.
- 2026-08-28: Fixed 6 `tsc` errors from the adopted commit and closed a real `/runs` credential-class gap (AC-3 mirror) with RED/GREEN evidence. Focused 93/93, unit regression 2,292 passed, typecheck clean.
- 2026-08-28: AC-2 advanced on committed upstream execution evidence. Slice 4 task items marked complete at code level; AC-level closure held pending live-database proof.
- 2026-08-28: Correct Course — resolved the ingest write-path contradiction in favour of direct app-role inserts (repo precedent + epic contract). Migration 48: grants restored, 2 INSERT policies added, per-lease UNIQUE dropped, `summary_record_id` added, security-definer gateway removed, `group_id` CHECK completed. Migration test realigned. Decision-engine wiring deferred to Slice 5.
- 2026-08-28: Slice 5 — sequenced `evaluateIngestDecision` into `persistIngestBatch` after the summary record is durably inserted (FK-ordering-safe), added `HELD_MISSING_SUMMARY` for batches with no `scan_summary`, derived `errorPresent` from `redactionProvenance.omittedFields` with a pinned test, and added the `bumblebee_run_decisions_promoted_idx` partial index. `ingest-decision.ts` is no longer dead code — it now has one production caller. Focused bumblebee lane 98/98, full unit regression 2,297 passed / 0 failed, typecheck clean. Live-database proof of the FK/CHECK acceptance and the retrieval views still not obtained (same blocker as prior sessions). Profile/staleness read-side semantics (Slice 5 third bullet) explicitly left open — no retrieval endpoint exists to implement it against.

## Status

In Progress — Slices 1–4 committed/corrected and unit-green (see above). **Slice 5 (this session): `ingest-decision.ts` wired into `persistIngestBatch`.** `bumblebee_run_decisions` now receives one append-only row per non-replayed batch with a correctly-ordered `summary_record_id` FK reference; promoted-complete, empty-complete (AC-10 known-empty), missing-summary, and errorPresent-contradiction paths are each covered by a dedicated unit test that round-trips real NDJSON through `parseIngestRequest`. Added the Knuth-flagged `bumblebee_run_decisions_promoted_idx` partial index. Still NOT implemented: read-side profile/staleness semantics (no retrieval endpoint exists yet) — left open, not claimed. STILL BLOCKED on the live-PostgreSQL lane (candidate container credentials unknown; runner defaults point at the append-only Brain ledger) — so AC-11 and the retrieval half of AC-18 remain open pending that proof, even though the write path that feeds them is now wired and unit-tested. ACs 1, 3–18 open; AC-2 advanced.
