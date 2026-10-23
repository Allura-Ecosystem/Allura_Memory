# Development story handoff packets — 2026-10-21

> [!NOTE]
> **AI-Assisted Documentation** — prepared by Codex/Woz for review; these are supporting execution packets, not a seventh canonical specification or human approval.

The [six canonical documents](../../allura/BLUEPRINT.md) own intent, architecture, behavior, traceability, decisions and data. The [readiness matrix](../../allura/REQUIREMENTS-MATRIX.md#development-slices-and-handoff-gates) and [AD-65–68](../../allura/RISKS-AND-DECISIONS.md#development-readiness-decisions--2026-10-20) govern every packet. If a packet conflicts, stop the affected implementation and reconcile the owning canonical decision.

## Revision, authority and execution boundary

- Integration base: `c720aca2ed09ac7d51776dacf3ed6f5867587fac` (verified PR #169 merge on main); content source: `51e421ca065337ab3e6a5f804dc970447d5eed15` (its reviewed head).
- Input: primary checkout `28d90e84364d1f99e67df4f8a4ebdaafb6fcf0d9` plus the exact dirty documentation hashes and selected-diff SHA-256 in [source-manifest.json](source-manifest.json). This input snapshot is not a deployable product revision. Final integration commit and checks belong in the parent delivery receipt; refresh `git rev-parse HEAD`, relevant diff/digest and runtime/lock digests before executing each story.
- Scope: Allura system repository work, `group_id=allura-system`; transport owns principal identity and authenticated workspace/action authority. No persona `user_id`, scope grant, new endpoint, excluded tenant, external sharing or semantic promotion is authorized. Current project credential remains tenant-bound; source access never grants transfer authority.
- Shared hydration: permitted MCP_DOCKER memory search returned tool-not-found; no scoped Brain result or write receipt obtained. This does not prove Brain is disconnected. Continue accessible local preparation, but any gate needing unavailable live memory/access remains unverified. Do not invent a successful log or idempotency field unsupported by the actual tool schema.
- Work tracker: packets record engineering preparation only. A fresh parent read located the general Engine board `4c23162d-587f-479a-983f-3282026a7cf4` (data source `c0c26620-f2a7-4099-9147-084032a17c2e`); no story item status or remote update is implied. Notion is the existing work-status source; DOC-09 still gates a different operational board and synchronization behavior. No packet changes a remote status, records a human decision, or marks product implementation Done.
- Environments: read-only source checks and hermetic offline tests may proceed under current scope. Database mutation/fault/concurrency tests require a specifically approved disposable instance with synthetic principals/workspaces and restricted application role. No ambient `.env`, production-adjacent services, runtime/config/schema changes, provider access or live remote writes are implied by a command example.
- Commands below are candidate starting points, not executed results. Confirm scripts and test collection at the chosen revision. Existing test files may lack the new acceptance cases; extend the production entrypoint tests only after the stated gates pass. A missing file, skipped required case or zero collected critical suites is missing evidence. `bun run lint` currently aliases typecheck; actual ESLint is `bun run lint:eslint`. Use the current pinned Bun and frozen lockfile.
- Assigned builders/reviewers are future responsibilities. A named role is not evidence it ran. Choose one writer per bounded change and independently review the actual final diff.

## Readiness and recommended order

“Ready — preparation” means the bounded inventory/specification work can begin; it does not authorize the story’s gated runtime/schema/config effects. No row is Done, Approved or released. Start DEV-00 and DEV-01, then prepare DEV-05B against approved DOC-06 while AD-65–68 and DOC-02/09 proposals are reviewed.

| Slice | Readiness | Implementation owner | Independent review |
|---|---|---|---|
| [DEV-00](#dev-00) | Ready — read-only inventory | Hightower | Knuth + Brooks |
| [DEV-01](#dev-01) | Ready — inventory and test-story preparation | Woz | Pike + Fowler |
| [DEV-02](#dev-02) | Needs a decision | Hightower | Fowler |
| [DEV-03](#dev-03) | Needs a decision | Woz | Knuth + Pike |
| [DEV-04](#dev-04) | Needs a decision | Woz | Knuth + Pike |
| [DEV-05A](#dev-05a) | Needs a decision | Woz | Knuth + Pike |
| [DEV-05B](#dev-05b) | Ready — bounded story preparation; implementation gated | Woz | Knuth + Pike |
| [DEV-06](#dev-06) | Needs a decision; remote writes Blocked without transfer authority | Woz | Hightower + Knuth |
| [DEV-07](#dev-07) | Ready — read-only diagnostics; telemetry Needs a decision | Woz | Hightower + Pike |
| [DEV-08](#dev-08) | Ready — authorized fixture/label planning; tuning Needs a decision | Bellard or Carmack (choose one before execution) | Knuth + independent human label reviewer |
| [DEV-09](#dev-09) | Ready — inventory/guidance; upgrades Need a decision | Fowler + Woz (one writer per bounded substory) | Pike + Hightower; Brooks owns claims |
| [DEV-10](#dev-10) | Blocked — affected work-item journey; other acceptance Needs a decision | Woz | Pike + Munari (actual scoped invocation required) |

## DEV-00

**Deployment, migration and authority baseline — Ready — read-only inventory.** Writer: Hightower. Independent review: Knuth + Brooks.

- **Objective:** Inventory deployed revision, installed migrations, restricted roles, active tool schemas and current diff; distinguish source from live facts.
- **Non-goals:** No service startup, grant/config changes, production SQL or inferred deployed state.
- **Traceability:** DEV-AC02/06/10; BP-F60/64/68. Canonical acceptance is [DEV-AC01–12](../../allura/REQUIREMENTS-MATRIX.md#acceptance-evidence-and-use-case-index); repeat its exact applicable criteria in the implementation PR.
- **Dependencies and decisions:** No prerequisite for accessible read-only inspection; operator-only facts remain Blocked without authorized access. Existing scope invariants; no AD-65–68 choice is approved here.
- **Source/scope:** Use the exact revision/diff and authority packet above; inspect `docker/postgres-init/`, `src/lib/db/workspace-scope.ts`, `src/lib/auth/principal-context.ts`, `src/mcp/canonical-tools.ts` before choosing touched files and schema versions. No listed source path proves deployed behavior.
- **Verification starting points:** `git rev-parse HEAD; git status --short; git diff --name-status; bun run validate:route-scope-manifest`. Split the semicolon-separated commands into individual invocations; collect suite/file/test counts, pass/fail/skip, exit codes and logs. Required new cases are acceptance work, not claimed existing coverage.
- **Negative/failure cases:** Record denied/missing access as missing; compare declared/installed migration and service revisions without connecting to a different tenant.
- **Completion/read-back evidence:** Source/tool manifest with revision, date, scope and access source; list every unverified deployed fact. Attach final diff, actual independent reviewer verdict and authorized tracker/Brain receipts or explicit unmet gates. Passing docs guards alone cannot close this product story.
- **Rollback:** No runtime mutation; revert only this story’s documentation commit. Review rollback and compatibility before any mutation; retain all append-only events and immutable semantic history.

## DEV-01

**Critical test discovery and behavior plan — Ready — inventory and test-story preparation.** Writer: Woz. Independent review: Pike + Fowler.

- **Objective:** Map critical capture/auth/review/retrieval/receipt tests to actual lane include rules and define missing behavioral regressions.
- **Non-goals:** No production DB, broad suite rewrites, or zero-test success as completion.
- **Traceability:** DEV-AC06; BP-F64. Canonical acceptance is [DEV-AC01–12](../../allura/REQUIREMENTS-MATRIX.md#acceptance-evidence-and-use-case-index); repeat its exact applicable criteria in the implementation PR.
- **Dependencies and decisions:** Accessible source and DEV-00 manifest; disposable integration execution requires its own approved environment. Existing validation requirements; new lane/config policy remains AD-68 Proposed.
- **Source/scope:** Use the exact revision/diff and authority packet above; inspect `vitest.config.unit.ts`, `vitest.config.integration.ts`, `vitest.config.live-db.ts`, `src/__tests__/curator-approve.test.ts` before choosing touched files and schema versions. No listed source path proves deployed behavior.
- **Verification starting points:** `bun run test:unit src/__tests__/mcp-auth-adversarial.test.ts src/lib/auth/__tests__/principal-context.test.ts src/lib/memory/retrieval-authority.test.ts; bun run typecheck --incremental false --pretty false`. Split the semicolon-separated commands into individual invocations; collect suite/file/test counts, pass/fail/skip, exit codes and logs. Required new cases are acceptance work, not claimed existing coverage.
- **Negative/failure cases:** In a disposable test configuration, deliberately omit one required suite and verify discovery gate fails; plan foreign-scope, requester-approval and receipt-failure behavior checks.
- **Completion/read-back evidence:** Per-file lane inventory, collected nonzero test counts and baseline verdicts; each gap has a bounded follow-up. Attach final diff, actual independent reviewer verdict and authorized tracker/Brain receipts or explicit unmet gates. Passing docs guards alone cannot close this product story.
- **Rollback:** Revert the inventory/test-plan commit; do not alter service state. Review rollback and compatibility before any mutation; retain all append-only events and immutable semantic history.

## DEV-02

**Reproducible authoritative main CI — Needs a decision.** Writer: Hightower. Independent review: Fowler.

- **Objective:** Propose then implement reviewed runtime pin, frozen install, actual ESLint, separate typecheck and critical-suite discovery.
- **Non-goals:** No dependency-wide upgrade or replacing checks with weaker aliases.
- **Traceability:** DEV-AC07; BP-F65. Canonical acceptance is [DEV-AC01–12](../../allura/REQUIREMENTS-MATRIX.md#acceptance-evidence-and-use-case-index); repeat its exact applicable criteria in the implementation PR.
- **Dependencies and decisions:** DEV-01; owner-approved authoritative lanes/runtime/config changes under AD-68. AD-68 Proposed; pin/runtime changes require applicable approval.
- **Source/scope:** Use the exact revision/diff and authority packet above; inspect `package.json`, `bun.lock`, `.github/workflows/ci.yml`, `scripts/ci/lint-changed.sh` before choosing touched files and schema versions. No listed source path proves deployed behavior.
- **Verification starting points:** `bun --version; bun install --frozen-lockfile; bun run lint:eslint --no-fix; bun run typecheck --incremental false --pretty false; bun run test:unit`. Split the semicolon-separated commands into individual invocations; collect suite/file/test counts, pass/fail/skip, exit codes and logs. Required new cases are acceptance work, not claimed existing coverage.
- **Negative/failure cases:** Disposable CI branch: induce lint and missing-suite failures, verify both fail; compare lock digest before/after install.
- **Completion/read-back evidence:** Exact-head hosted results, runtime/lock digests and nonzero required-suite counts; required skips stay explicit. Attach final diff, actual independent reviewer verdict and authorized tracker/Brain receipts or explicit unmet gates. Passing docs guards alone cannot close this product story.
- **Rollback:** Revert CI-only commit; retain prior required checks until replacement evidence accepted. Review rollback and compatibility before any mutation; retain all append-only events and immutable semantic history.

## DEV-03

**Durable capture replay and index intent — Needs a decision.** Writer: Woz. Independent review: Knuth + Pike.

- **Objective:** Implement the approved capture operation identity and atomic event/receipt/replay/index-intent boundary, with honest downstream status.
- **Non-goals:** No content-marker pseudo-idempotency, persona identity or automatic promotion.
- **Traceability:** DEV-AC01; BP-F59. Canonical acceptance is [DEV-AC01–12](../../allura/REQUIREMENTS-MATRIX.md#acceptance-evidence-and-use-case-index); repeat its exact applicable criteria in the implementation PR.
- **Dependencies and decisions:** DEV-00/01; AD-65 compatibility, canonicalization, transaction/replay/key-retention decisions; schema approval. AD-65 Proposed; append-only/authenticated identity remain binding.
- **Source/scope:** Use the exact revision/diff and authority packet above; inspect `src/mcp/canonical-tools.ts`, `src/lib/memory/canonical-contracts.ts`, `src/__tests__/canonical-memory.test.ts` before choosing touched files and schema versions. No listed source path proves deployed behavior.
- **Verification starting points:** `bun run test src/__tests__/canonical-memory.test.ts; bun run typecheck --incremental false --pretty false; bun run test:live-db (only approved disposable target and declared suites)`. Split the semicolon-separated commands into individual invocations; collect suite/file/test counts, pass/fail/skip, exit codes and logs. Required new cases are acceptance work, not claimed existing coverage.
- **Negative/failure cases:** Concurrent same-key success creates one durable capture; changed payload conflicts; foreign actor/workspace denied; inject before-commit rollback and lost-ack same-key reconciliation; provider failure preserves capture.
- **Completion/read-back evidence:** Exact principal/destination/record/marker-or-digest/receipt read-back; original replay receipt equality and one index intent. Attach final diff, actual independent reviewer verdict and authorized tracker/Brain receipts or explicit unmet gates. Passing docs guards alone cannot close this product story.
- **Rollback:** Compatible additive migration/feature rollback approved before execution; preserve committed events and receipts, never delete them. Review rollback and compatibility before any mutation; retain all append-only events and immutable semantic history.

## DEV-04

**Workspace-authorized vector seam — Needs a decision.** Writer: Woz. Independent review: Knuth + Pike.

- **Objective:** Carry verified workspace authority through vector insert/search and confirm scoped fallback/failure reporting.
- **Non-goals:** No tenant-only fallback, guessed workspace, retired backend or automatic legacy-row repair.
- **Traceability:** DEV-AC02; BP-F60. Canonical acceptance is [DEV-AC01–12](../../allura/REQUIREMENTS-MATRIX.md#acceptance-evidence-and-use-case-index); repeat its exact applicable criteria in the implementation PR.
- **Dependencies and decisions:** DEV-00/01; DEV-03 integration contract; AD-66 reviewed authority signatures and migration/role baseline. AD-66 Proposed; no new grants or quarantine migration.
- **Source/scope:** Use the exact revision/diff and authority packet above; inspect `src/lib/ruvector/bridge.ts`, `src/lib/ruvector/retrieval-adapter.ts`, `docker/postgres-init/40-workspace-subgraph-forward-upgrade.sql` before choosing touched files and schema versions. No listed source path proves deployed behavior.
- **Verification starting points:** `bun run test src/lib/ruvector/bridge.test.ts src/lib/ruvector/retrieval-adapter.test.ts src/lib/graph-adapter/__tests__/ruvector-workspace-authority.test.ts; bun run typecheck --incremental false --pretty false`. Split the semicolon-separated commands into individual invocations; collect suite/file/test counts, pass/fail/skip, exit codes and logs. Required new cases are acceptance work, not claimed existing coverage.
- **Negative/failure cases:** Two synthetic workspaces under restricted role; pool-reuse isolation; forged/missing/locked scope; provider timeout, dimension mismatch and superseded/current exclusions.
- **Completion/read-back evidence:** Vector and lexical own-scope discovery plus zero foreign results, exact migration/role and provider/index provenance. Attach final diff, actual independent reviewer verdict and authorized tracker/Brain receipts or explicit unmet gates. Passing docs guards alone cannot close this product story.
- **Rollback:** Disable new worker/seam through reviewed compatible release path; preserve durable source and quarantined rows. Review rollback and compatibility before any mutation; retain all append-only events and immutable semantic history.

## DEV-05A

**Governed correction and one current semantic head — Needs a decision.** Writer: Woz. Independent review: Knuth + Pike.

- **Objective:** Submit scoped pending corrections and atomically create approved new versions with preserved lineage after independent human review.
- **Non-goals:** No in-place content edit, autonomous approval, automatic rebase or restore/duplicate-policy implementation.
- **Traceability:** DEV-AC03; BP-F61. Canonical acceptance is [DEV-AC01–12](../../allura/REQUIREMENTS-MATRIX.md#acceptance-evidence-and-use-case-index); repeat its exact applicable criteria in the implementation PR.
- **Dependencies and decisions:** DEV-03/04; AD-67 public mapping, proposal/base fields and concurrency decision. AD-67 Proposed; DOC-03 restore and DOC-05 duplicate decisions remain unresolved.
- **Source/scope:** Use the exact revision/diff and authority packet above; inspect `src/mcp/canonical-tools.ts`, `src/lib/memory/approve-proposal.ts`, `src/lib/graph-adapter/ruvector-adapter.ts` before choosing touched files and schema versions. No listed source path proves deployed behavior.
- **Verification starting points:** `bun run test src/__tests__/curator-approve.test.ts src/lib/memory/governance-receipt-writer.test.ts; bun run typecheck --incremental false --pretty false; approved disposable concurrency suite`. Split the semicolon-separated commands into individual invocations; collect suite/file/test counts, pass/fail/skip, exit codes and logs. Required new cases are acceptance work, not claimed existing coverage.
- **Negative/failure cases:** Reject requester self-approval, stale base and foreign evidence; race two approvals; inject every version/lineage/audit/outbox/receipt/replay write failure.
- **Completion/read-back evidence:** Exactly one current head, intact old content/edges, atomic rollback and independently reviewed human decision receipt. Attach final diff, actual independent reviewer verdict and authorized tracker/Brain receipts or explicit unmet gates. Passing docs guards alone cannot close this product story.
- **Rollback:** Disable new submission path; preserve all committed versions/edges and receipts; no history rewrite. Review rollback and compatibility before any mutation; retain all append-only events and immutable semantic history.

## DEV-05B

**Bind approval to the human-reviewed proposal version — Ready — bounded story preparation; implementation gated.** Writer: Woz. Independent review: Knuth + Pike.

- **Objective:** Implement expected_proposal_version validation and durable reviewed_proposal_version while preserving successful replay-first behavior.
- **Non-goals:** No new approval authority, implicit fresh review, automatic retry against a new version or correction/restore scope.
- **Traceability:** DEV-AC04; BP-F62. Canonical acceptance is [DEV-AC01–12](../../allura/REQUIREMENTS-MATRIX.md#acceptance-evidence-and-use-case-index); repeat its exact applicable criteria in the implementation PR.
- **Dependencies and decisions:** DEV-01 baseline; ordinary API/schema implementation review and applicable approval; isolated DB fixture for atomicity proof. DOC-06 approved behavior; do not treat AD-67 correction design as approved.
- **Source/scope:** Use the exact revision/diff and authority packet above; inspect `src/app/api/curator/approve/route.ts`, `src/lib/memory/approve-proposal.ts`, `src/lib/memory/governance-receipt-writer.ts` before choosing touched files and schema versions. No listed source path proves deployed behavior.
- **Verification starting points:** `bun run test:unit src/__tests__/curator-approve-route.test.ts; bun run test src/__tests__/curator-approve.test.ts src/lib/memory/governance-receipt-writer.test.ts; bun run typecheck --incremental false --pretty false`. Split the semicolon-separated commands into individual invocations; collect suite/file/test counts, pass/fail/skip, exit codes and logs. Required new cases are acceptance work, not claimed existing coverage.
- **Negative/failure cases:** Missing/malformed expected version denies; reviewed v3/current v4 conflicts with zero new writes; same successful key replays original receipt even after transition; concurrent stale decision cannot win.
- **Completion/read-back evidence:** Review/result versions are accurate and distinct; byte-equivalent original replay receipt; atomic no-write stale rejection proven against approved disposable DB. Attach final diff, actual independent reviewer verdict and authorized tracker/Brain receipts or explicit unmet gates. Passing docs guards alone cannot close this product story.
- **Rollback:** Revert compatible API/service code only under reviewed migration plan; retain historical receipts and columns/records needed to read them. Review rollback and compatibility before any mutation; retain all append-only events and immutable semantic history.

## DEV-06

**Confirmed remote delivery and eligible retries — Needs a decision; remote writes Blocked without transfer authority.** Writer: Woz. Independent review: Hightower + Knuth.

- **Objective:** Bridge durable promotion intent to remote work and report separate append-only delivery observations based on read-back.
- **Non-goals:** No rewriting immutable decision receipt, using HTTP/local delivered as synced, or alternate destination after denial.
- **Traceability:** DEV-AC05; BP-F63. Canonical acceptance is [DEV-AC01–12](../../allura/REQUIREMENTS-MATRIX.md#acceptance-evidence-and-use-case-index); repeat its exact applicable criteria in the implementation PR.
- **Dependencies and decisions:** DEV-03–05 contracts; AD-68 implementation decision; verified destination and source-to-destination transfer authority before remote effects. DOC-07 approved meaning; AD-68 read route/digest/retry details Proposed.
- **Source/scope:** Use the exact revision/diff and authority packet above; inspect `src/lib/memory/promotion-outbox-worker.ts`, `src/curator/notion-sync-worker.ts`, `src/__tests__/notion-projection-sync.test.ts` before choosing touched files and schema versions. No listed source path proves deployed behavior.
- **Verification starting points:** `bun run test src/__tests__/notion-projection-sync.test.ts src/__tests__/notion-sync-worker.test.ts src/__tests__/notion-sync-dlq.test.ts; bun run typecheck --incremental false --pretty false`. Split the semicolon-separated commands into individual invocations; collect suite/file/test counts, pass/fail/skip, exit codes and logs. Required new cases are acceptance work, not claimed existing coverage.
- **Negative/failure cases:** Duplicate/competing workers, future available_at, crash after remote effect, timeout/unknown same-key reconciliation, changed digest/destination conflict and revoked transfer.
- **Completion/read-back evidence:** Exact destination/principal/remote ID/source digest/receipt read-back; immutable original approval receipt unchanged. Attach final diff, actual independent reviewer verdict and authorized tracker/Brain receipts or explicit unmet gates. Passing docs guards alone cannot close this product story.
- **Rollback:** Stop new deliveries and revoke only newly authorized grants/envelopes if rollback authorized; preserve records/pending operations and never reroute them. Review rollback and compatibility before any mutation; retain all append-only events and immutable semantic history.

## DEV-07

**Truthful outcome and safe correlation — Ready — read-only diagnostics; telemetry Needs a decision.** Writer: Woz. Independent review: Hightower + Pike.

- **Objective:** Inventory stage/outcome errors and prepare minimal approved observation/correlation repairs.
- **Non-goals:** No raw content/credentials/foreign identifiers in logs; no high-cardinality metric labels.
- **Traceability:** DEV-AC08; BP-F66. Canonical acceptance is [DEV-AC01–12](../../allura/REQUIREMENTS-MATRIX.md#acceptance-evidence-and-use-case-index); repeat its exact applicable criteria in the implementation PR.
- **Dependencies and decisions:** DEV-00/01 for diagnostics; AD-68 approval for changed fields, retention or external destinations. Existing truthful-status/redaction contract; new observation schema Proposed.
- **Source/scope:** Use the exact revision/diff and authority packet above; inspect `src/mcp/canonical-tools.ts`, `src/lib/health/metrics.ts`, `src/lib/dashboard/read-service.ts` before choosing touched files and schema versions. No listed source path proves deployed behavior.
- **Verification starting points:** `bun run test:unit src/__tests__/health-metrics.test.ts src/__tests__/health-metrics-scope.test.ts; bun run typecheck --incremental false --pretty false`. Split the semicolon-separated commands into individual invocations; collect suite/file/test counts, pass/fail/skip, exit codes and logs. Required new cases are acceptance work, not claimed existing coverage.
- **Negative/failure cases:** Inject capture failure, indexing-only failure and dashboard error; timeout stays unknown; verify logs/metrics do not expose sensitive data.
- **Completion/read-back evidence:** Stage-bound counters and safe correlation join with source revision; source-local dashboard tests require their separate integration. Attach final diff, actual independent reviewer verdict and authorized tracker/Brain receipts or explicit unmet gates. Passing docs guards alone cannot close this product story.
- **Rollback:** Revert observation code/config under approved retention contract; retain append-only evidence already written. Review rollback and compatibility before any mutation; retain all append-only events and immutable semantic history.

## DEV-08

**Labeled retrieval baseline — Ready — authorized fixture/label planning; tuning Needs a decision.** Writer: Bellard or Carmack (choose one before execution). Independent review: Knuth + independent human label reviewer.

- **Objective:** Prepare versioned corpus/query labels, then measure mode-separated relevance/freshness and latency before bounded tuning.
- **Non-goals:** No actual foreign-tenant reads, unauthorized source copying, holdout tuning or automated semantic promotion.
- **Traceability:** DEV-AC09; BP-F67. Canonical acceptance is [DEV-AC01–12](../../allura/REQUIREMENTS-MATRIX.md#acceptance-evidence-and-use-case-index); repeat its exact applicable criteria in the implementation PR.
- **Dependencies and decisions:** Fixture access authority; DEV-04 before tuning; AD-68 budgets and human-reviewed labels/holdout. AD-68 Proposed; no performance targets inferred from one slow observation.
- **Source/scope:** Use the exact revision/diff and authority packet above; inspect `src/__tests__/retrieval-benchmark.test.ts`, `src/lib/evals/`, `src/__tests__/memory-search-ruvector.test.ts` before choosing touched files and schema versions. No listed source path proves deployed behavior.
- **Verification starting points:** `bun run test src/__tests__/retrieval-benchmark.test.ts src/__tests__/memory-search-ruvector.test.ts; bun run eval:portfolio --help (inspect actual CLI before execution)`. Split the semicolon-separated commands into individual invocations; collect suite/file/test counts, pass/fail/skip, exit codes and logs. Required new cases are acceptance work, not claimed existing coverage.
- **Negative/failure cases:** Current versus superseded contradictory answers, historical intent, no-answer, foreign synthetic workspace, empty index, provider failure and excessive limits.
- **Completion/read-back evidence:** Human label decision, frozen digests, sample counts, MRR/precision/recall/freshness, p50/p95 plus timeout/fallback conditions and zero unauthorized results. Attach final diff, actual independent reviewer verdict and authorized tracker/Brain receipts or explicit unmet gates. Passing docs guards alone cannot close this product story.
- **Rollback:** Revert tuning only; preserve labeled baseline, immutable results and source-access restrictions. Review rollback and compatibility before any mutation; retain all append-only events and immutable semantic history.

## DEV-09

**Dependency, consumer and claims maintenance — Ready — inventory/guidance; upgrades Need a decision.** Writer: Fowler + Woz (one writer per bounded substory). Independent review: Pike + Hightower; Brooks owns claims.

- **Objective:** Inventory imports/exports/SDK/CLI consumers and evidence-backed usage; propose incremental compatibility fixes.
- **Non-goals:** No latest-everything upgrade, deleting historical migrations/fail-closed stubs or unsupported compliance/stability claims.
- **Traceability:** DEV-AC11/12; BP-F69/70. Canonical acceptance is [DEV-AC01–12](../../allura/REQUIREMENTS-MATRIX.md#acceptance-evidence-and-use-case-index); repeat its exact applicable criteria in the implementation PR.
- **Dependencies and decisions:** DEV-01 inventory; AD-68 explicit upgrades/removal/deprecation and compatibility decisions. Existing truthful capability guidance; AD-68 upgrade choices Proposed.
- **Source/scope:** Use the exact revision/diff and authority packet above; inspect `package.json`, `packages/sdk/`, `packages/sdk/test/dist-consumer.test.ts`, `src/mcp/`, `examples/` before choosing touched files and schema versions. No listed source path proves deployed behavior.
- **Verification starting points:** `bun run typecheck --incremental false --pretty false; bun run test packages/sdk/test/dist-consumer.test.ts; inspect package-local test scripts before packed consumer runs`. Split the semicolon-separated commands into individual invocations; collect suite/file/test counts, pass/fail/skip, exit codes and logs. Required new cases are acceptance work, not claimed existing coverage.
- **Negative/failure cases:** Legacy and packed SDK consumers, missing exports, clean install, declared lane migration and removed-code import/build negatives.
- **Completion/read-back evidence:** Dated official documentation/advisory references, consumer matrix, reviewed compatibility window and revision-bound capability table. Attach final diff, actual independent reviewer verdict and authorized tracker/Brain receipts or explicit unmet gates. Passing docs guards alone cannot close this product story.
- **Rollback:** Revert bounded dependency/consumer commit; preserve old-reader compatibility and checked lockfile. Review rollback and compatibility before any mutation; retain all append-only events and immutable semantic history.

## DEV-10

**Authenticated end-to-end dashboard acceptance — Blocked — affected work-item journey; other acceptance Needs a decision.** Writer: Woz. Independent review: Pike + Munari (actual scoped invocation required).

- **Objective:** Prepare then prove authorized sign-in → capture → independent human decision → receipt → current retrieval and remote observation if enabled.
- **Non-goals:** No synthetic preview as security proof, department as role, admin confidentiality bypass or deployment implied by a build.
- **Traceability:** DEV-AC10; BP-F68. Canonical acceptance is [DEV-AC01–12](../../allura/REQUIREMENTS-MATRIX.md#acceptance-evidence-and-use-case-index); repeat its exact applicable criteria in the implementation PR.
- **Dependencies and decisions:** DOC-02 visual reference, DOC-09 work-board authority and ENT contracts; DEV-03–06 for full memory journey; authorized synthetic multi-user environment. DOC-06/07 approved; DOC-02/09 and ENT choices unresolved.
- **Source/scope:** Use the exact revision/diff and authority packet above; inspect `src/app/dashboard/`, `src/lib/dashboard/read-service.ts`, `docs/allura/DESIGN-ALLURA.md` before choosing touched files and schema versions. No listed source path proves deployed behavior.
- **Verification starting points:** `bun run test:dashboard-http; bun run typecheck --incremental false --pretty false; bun run build (isolated approved environment); story-specific browser journey`. Split the semicolon-separated commands into individual invocations; collect suite/file/test counts, pass/fail/skip, exit codes and logs. Required new cases are acceptance work, not claimed existing coverage.
- **Negative/failure cases:** Two synthetic employees/shared workspace, foreign-scope denial, revocation, stale review, unavailable work-items, keyboard/phone states and unknown remote outcome.
- **Completion/read-back evidence:** Actual authorized multi-user journey, exact visual reference, independent human approval and revision-bound responsive/accessibility evidence; release needs separate target approval. Attach final diff, actual independent reviewer verdict and authorized tracker/Brain receipts or explicit unmet gates. Passing docs guards alone cannot close this product story.
- **Rollback:** Roll back presentation via reviewed compatible release path; preserve durable history and original receipts; no production action in preparation. Review rollback and compatibility before any mutation; retain all append-only events and immutable semantic history.

## Decision proposals to unblock implementation

These questions prepare concrete owner decisions; they do not change their current Proposed/unresolved status.

| Decision | Proposed disposition to review | Required owner action before affected implementation |
|---|---|---|
| AD-65 | Scope capture replay by authenticated tenant/workspace/principal/kind/key; bind canonical payload digest; commit capture/receipt/replay/index-intent atomically; keep legacy compatibility explicit | Sabir approves user-visible failure/retry/compatibility; Brooks/Pike/Knuth/Hightower settle syntax, storage, retention and bounded retry details |
| AD-66 | Carry verified authority through vector paths; restricted scoped transactions; equivalent-scope lexical degradation only; preserve quarantined rows | Knuth/Pike review signatures/RLS and Hightower confirms actual migration/role baseline; Sabir approves any security/schema/production change |
| AD-67 | Pending correction plus immutable new version/lineage after independent human review; reject stale base and stale reviewed proposal | Sabir accepts correction/conflict UX; Brooks/Pike/Knuth agree public mapping, fields and single-head concurrency; leave DOC-03/05 separate |
| AD-68 | Explicit required lanes/discovery, reproducible tooling, stage-bound observations and labeled baseline; DOC-07 separate delivery observations | Hightower/Fowler name authoritative lanes/runtime; owners decide telemetry/delivery details; Sabir approves upgrades, budgets and changed retention/destinations |
| DOC-02 / DOC-09 / ENT | Supply exact approved visual reference; select one operational work-board authority and explicit synchronization/conflict model; settle workspace roles/confidential administration | Sabir chooses intended product behavior; Brooks records compatible boundaries; independent design/security review before implementation |

For a required approval, present the exact diff/contract, authenticated actor, action, target scope, intended effect and one-time boundary. Reuse current-session authorization where applicable; do not demand a magic approval phrase. An ordinary merge authorization does not adopt these proposals, provision access or approve release.
