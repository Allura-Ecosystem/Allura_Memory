# Epic 24 Post-Merge Adversarial Review

**Date:** 2026-08-22  
**Reviewer:** Troy  
**Scope:** Stories 24.4–24.9, merged through PRs #82–#87  
**Verdict:** **CHANGES REQUESTED — Epic 24 reopened**

## Executive verdict

Hosted CI was green when the PRs merged, but the merged implementation does not satisfy the acceptance criteria for Stories 24.4–24.9. Green checks proved only the paths those checks exercised. They did not prove production entrypoint delegation, process-engine composition, measured evaluation execution, workspace package viability, documentation traceability, or runnable reference integrations.

The prior `done` status was incorrect. This review reopens Stories 24.4–24.9 and keeps Stories 24.1–24.3 and 24.10 complete.

### Independent-review limitation

Two independent-agent passes were attempted but did not produce a verdict: the standalone Codex CLI returned HTTP 401 because its separate CLI credentials were unavailable, and the configured OpenCode provider returned server error `err_6609986c`. No independent approval is claimed. Independent re-review remains a mandatory closure gate.

## Reproduced evidence

| Check | Result | Evidence |
|---|---|---|
| CLI parser | **FAIL** | `bun packages/cli/src/index.ts --help` exits 1 at `packages/cli/src/index.ts:179` (`"inherit""inherit"`) |
| SDK unit tests | PASS | 49 tests pass, but tests import retained modules rather than proving the overwritten public index contract |
| SDK build | **FAIL** | `cd packages/sdk && bun run build` → `Script not found "build"` |
| Fresh dependency install | **FAIL** | `bun install --frozen-lockfile` fails in Puppeteer postinstall because the required browser setup/skip path is undocumented |
| Story files vs sprint status | **CONTRADICTION** | Story files say `ready-for-dev` / `pending`; sprint status said `done` |

## Critical findings

### C1 — Story 24.4 production entrypoints bypass the atomic service

- **Files:** `src/app/api/curator/approve/route.ts:337-400`, `src/curator/approve-cli.ts:191-230`
- **Violated:** 24.4 AC-1, AC-2, AC-4, Definition of Done
- The HTTP route retains its own proposal update, audit, and `promotion_sync_pending` sequencing and never calls `approveProposal`.
- The CLI also updates `canonical_proposals` and appends events directly.
- No MCP approval entrypoint delegates to the service.
- Result: the code advertised as the “sole approval domain operation” is not the production operation.

### C2 — Atomic promotion disables all database triggers and requires elevated privilege

- **File:** `src/lib/memory/approve-proposal.ts:89-95`
- **Violated:** 24.4 AC-4, AC-8; Story 24.3 least-privilege posture
- `SET LOCAL session_replication_role = 'replica'` disables every normal trigger in the transaction, including trigger-backed referential-integrity and audit behavior.
- Setting it is restricted to superuser or an explicitly privileged role; a least-privilege application principal cannot rely on it.
- The suppression scope is broader than the one legacy trigger it intended to avoid.

### C3 — Promotion outbox concurrency lock is ineffective

- **File:** `src/lib/memory/promotion-outbox-worker.ts:20-37`
- **Violated:** 24.4 AC-7, AC-9
- `SELECT ... FOR UPDATE SKIP LOCKED` runs through `pool.query()` outside an explicit transaction. PostgreSQL releases the row locks when that statement’s implicit transaction ends.
- Delivery then runs on different checked-out clients, so concurrent workers can select and emit the same outbox row.

### C4 — Story 24.5 does not execute the process engine and replay integrity is incomplete

- **Files:** `src/lib/harness/runner.ts`, `src/lib/harness/scenario.ts:81-96`
- **Violated:** 24.5 AC-2–AC-8 and Definition of Done
- The runner loops through fixtures directly; it never composes `ProcessEngine`, its checkpoints, state manager, resume, replay, or quality gates.
- The simulate-mode “network disabled” conditional has an empty body and enforces nothing.
- Record mode never invokes or records a real permitted tool.
- Fixture response payloads are omitted from `scenarioDigest`, so a changed tool response can retain the same digest.
- Replay does not bind policy version or schema version.
- Side-effect “idempotency” only records unique strings; it does not prevent repeated effects on resume/replay.

### C5 — Story 24.6 evaluates caller-supplied scores, not datasets

- **Files:** `src/lib/evals/runner.ts:74-122`, `src/lib/evals/__tests__/eval-runner.test.ts`
- **Violated:** 24.6 AC-3–AC-6, AC-8, AC-10 and Definition of Done
- The caller supplies each metric’s final numeric value. The runner only compares that value to a threshold.
- It does not execute retrieval, policy, tenant-isolation, promotion, audit, replay, tool-contract, or latency cases from the declared datasets.
- `loadSuite()` returns `lanes: []`; the YAML lane declarations are not parsed or run.
- No portfolio evaluation job is wired into required CI, and no evaluation artifact hash is added to the Story 24.1 evidence manifest.

### C6 — Story 24.7 shipped a syntactically invalid CLI and regressed the SDK package

- **Files:** `packages/cli/src/index.ts:179`, `packages/sdk/src/index.ts`, `packages/sdk/package.json`
- **Violated:** 24.7 AC-1–AC-10
- CLI source does not parse.
- `up` and `down` print Docker commands but do not execute them.
- `doctor` checks only a Bun-reported version, one PostgreSQL connection, and migration-directory existence; it does not verify ports, migrations, gateway auth, schema compatibility, or a non-canonical round trip.
- PR #85 replaced the existing robust SDK public index/package metadata with a 79-line direct-fetch client and removed build/test/export scripts. Existing SDK tests still pass because they import retained internal modules directly.
- The replacement client omits auth configuration, MCP initialization/session handling, HTTP error checks, JSON-RPC error handling, validation, retries, and existing memory methods.

### C7 — Stories 24.8 and 24.9 are documentation stubs, not completed truth/evidence gates

- **Files:** PR #86 changed only four enterprise Markdown files; PR #87 changed five Markdown files
- **Violated:** 24.8 AC-1–AC-10; 24.9 AC-1–AC-10
- 24.8 did not update the canonical architecture documents, decisions/risks, evidence index, or CI documentation guards named by the story.
- 24.9 provides README prose only. There are no runnable integrations, scenarios, success/attack/recovery cases, receipts, evaluation results, cleanup paths, clean-environment timing record, or evidence-index links.
- The case study claims atomic production promotion and one-command evaluation despite C1 and C5.

## High findings

### H1 — Idempotency keys can replay a different proposal’s result

- **File:** `src/lib/memory/approve-proposal.ts:105-112`
- The lookup is keyed by tenant plus idempotency key but does not verify the stored `proposal_id` equals the requested proposal.

### H2 — Proposal selection is not tenant-scoped and does not establish RLS context

- **File:** `src/lib/memory/approve-proposal.ts:95-103`
- The first query locks by proposal ID only. It neither accepts/uses an asserted tenant in the query nor sets `app.current_tenant` before tenant-scoped access.

### H3 — “Reported complete” proves direct ID existence only

- **File:** `src/lib/memory/approve-proposal.ts:170-182`
- AC-10 requires retrieval by ID **and approved-only search**. The service performs only one direct `graph_memories` lookup.

### H4 — Numerical portfolio claims are not linked to current artifacts

- **File:** `docs/portfolio/principal-engineer-case-study.md:60-66`
- Counts have no immutable run/artifact links and the document overstates implementation maturity.

### H5 — Story and sprint artifacts contradict each other

- **Files:** `_bmad/bmm/stories/24-4-*.md` through `24-9-*.md`; `_bmad/bmm/stories/sprint-status.yaml`
- Story records remain `ready-for-dev` with pending agent records while the sprint file declared them done.

## Acceptance status after review

| Story | Review status | Reason |
|---|---|---|
| 24.4 | Changes requested | Production paths bypass service; unsafe trigger suppression; outbox race |
| 24.5 | Changes requested | Parallel fixture loop, not process-engine harness; replay/network/idempotency gaps |
| 24.6 | Changes requested | Threshold comparator, not a measured evaluation gate |
| 24.7 | Changes requested | CLI cannot parse; SDK package regressed; quickstart unverified |
| 24.8 | Changes requested | Canonical truth pass and CI guards not implemented |
| 24.9 | Changes requested | No runnable integrations or evidence bundle |

## Required remediation sequence

1. **24.4:** replace global trigger suppression with a narrowly scoped transaction setting checked by the legacy trigger; tenant-scope the lock; bind idempotency key to proposal; make HTTP/CLI/MCP delegate; fix outbox claiming; run live concurrency/rollback/retrieval tests.
2. **24.5:** compose the existing process-engine contracts, implement enforceable offline transport, real redacted record mode, policy/schema/fixture digests, resumable side-effect registry, and deterministic receipt tests.
3. **24.6:** execute all declared datasets through real adapters, emit reports/artifacts, wire a required CI job, and prove controlled red/green behavior.
4. **24.7:** restore the SDK package surface and build, implement an executable/tested CLI, create a safe local compose path, and record a clean-environment timed transcript.
5. **24.8:** complete canonical docs/ADRs/traceability/evidence and add broken-link/residue/capability-drift guards.
6. **24.9:** ship three runnable public-surface examples with 3 cases each, receipts/eval evidence, cleanup, measured setup effort, and a rehearsed demo.

Tracked work: #89 (24.4), #90 (24.5), #91 (24.6), #92 (24.7), #93 (24.8), and #94 (24.9).

## Review disposition

No critical or high finding is accepted as residual risk. All must be remediated and re-reviewed before Epic 24 can return to `done`.
