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
- [ ] **Real scanner execution:** a real pinned binary passes `go test`, build, `selftest`, and one representative schema-compatible scan. Synthetic TypeScript fixtures alone do not satisfy this AC.
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

- [ ] RED: migration 48 must define `line_count INTEGER NOT NULL` on batch receipts/records (test `ingest-migration.test.ts` currently failing)
- [ ] GREEN: add missing column to `docker/postgres-init/48-bumblebee-ingest-ledger.sql`; migration test passes
- [ ] RED→GREEN: repository rollback returns stable `BUMBLEBEE_INGEST_RECORD_CONFLICT` code instead of raw driver error (`ingest-repository.ts`)
- [ ] HTTPS-only production ingress with trusted-proxy scheme handling; cleartext rejected outside isolated loopback tests
- [ ] Authenticate/authorize (`bumblebee_ingest` only) before consuming body; compressed/expanded/line/record bounds; gzip bombs and unsupported encodings fail closed
- [ ] Strict NDJSON record conformance: package/finding/`scan_summary` against pinned contract; recomputed record IDs; malformed/unknown/mixed-identity fail closed
- [ ] Atomic all-or-nothing batch + immutable receipt commit; DB failure yields no durable-acceptance claim; partial acceptance forbidden

### Slice 5 — Promotion, snapshot truth, replay (ACs: Bound-population promotion; Snapshot truth; Profile/staleness; Idempotency and replay)

- [ ] Promotion decision engine (`ingest-decision.ts`): complete-bound promotes at generation; empty-complete = known-empty; findings-only/deep/partial/error/timeout/missing-summary hold evidence and preserve current state; contradictory counts/failed-batch held with stable reason codes
- [ ] Exact replay returns prior receipt; conflicting replay `409`; duplicate/late records and repeated summaries never duplicate state; older generation cannot replace current state
- [ ] Profile/staleness semantics: baseline/project separate with deliberate union; deep = campaign evidence; missing recent complete generations = stale, not clean

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

### Completion Notes

- Slices 1–3 are committed and independently reviewed green (Pike/Fowler/Knuth PASS; hosted CI 26/26 at `5bc606e7`).
- Slice 4 WIP exists uncommitted with 2 known RED failures (see Dev Notes); ingest-routes completion and typecheck were not yet verified.
- All corrected ACs remain open; statuses advance only with evidence per governed loop.

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

Uncommitted worktree changes (Slice 4+ WIP, preserve):

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

## Change Log

- 2026-08-27: Story replanned under Correct Course (PR #125); ACs corrected to upstream-plugin architecture; review verdict evidence tracked.
- 2026-08-28: BMad normalization — added Dev Notes (architecture guardrails, current state, verification commands), Tasks/Subtasks (Slices 1–8), Dev Agent Record, File List, Change Log sections per bmad-dev-story requirements. No ACs advanced; implementation state recorded truthfully.

## Status

In Progress — Slices 1–3 committed green; Slice 4 (NDJSON ingest) is the active Dev Story task, resuming from preserved WIP with 2 known RED failures.
