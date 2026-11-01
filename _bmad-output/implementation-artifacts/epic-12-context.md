# Epic 12 Context: Durable governed run kernel

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Provide a durable, scoped evidence-handoff run outside Brain. An operator must be able to pin a local artifact and definition, measure its integrity, stop for independent human review, and resume after losing the original process without duplicating committed effects. Local adoption covers the existing Epic 12, not release acceptance or a general methodology executor. Current all-14 authority supersedes the historical deferred heading. No live work status is inferred from this context or its associated specifications.

## Stories

- Story 12.1: Concrete use case, immutable run provenance and detailed contracts
- Story 12.2: Durable runs, journals, measured gates and approval continuation
- Story 12.3: Crash, replay, cancellation, drift, inspection and recovery evidence

## Requirements & Constraints

A run records what was admitted and what actually happened; pending, failed, partial and unknown cannot become success merely because HTTP returned successfully. Supplied artifact prose remains an unverified claim even when its bytes match an expected digest. Every new effect and disclosure requires current authenticated tenant/workspace/action authority. Stored approval is evidence, not a substitute for current reviewer authority.

Only a current human workspace administrator may own the initial run. Its designated reviewer must be a different current bound human administrator with audit-read access in that workspace. Machine, device, delegated client, org-only title and curator promotion authority confer no run permission. Preserve current identity issuance and client ceilings. Run approval never promotes semantic memory, updates work items, or changes operational status.

Definitions, inputs, original receipts and journal evidence are immutable. Runtime projections are separate guarded state. Same-key identical requests reconcile to their original admission; changed input conflicts without mutation. Ambiguous acknowledgements remain unknown until the same authoritative database establishes the receipt or confirmed absence. Never issue a fresh key automatically to hide ambiguity.

The initial definition is fixed, linear and data-only: prepare an artifact integrity receipt, wait for exact independent review, then append a local handoff receipt. Caller policy, executable handlers, outcome assertions and definition uploads are forbidden. No shell, network adapter, agent dispatch, service daemon, parallel DAG or external exactly-once guarantee is included.

Finite bounds apply to artifact bytes, goal/rationale size, retained runs, nonterminal runs, definition revisions, journal events, attempts, leases and operation duration. Saturation denies; immutable evidence is not deleted to make room. Private artifact, goal, rationale, identity bindings and lease tokens must not leak through operational logs or content-free projections.

## Technical Decisions

Use the existing Bun/TypeScript/PostgreSQL architecture and one authenticated gateway. Services own short scoped transactions. Normalized PostgreSQL JSON text determines definition, policy, input and command digests; raw UTF-8 bytes determine artifact hashes. Pin handler source identity without accepting a caller-provided executable registry. Definition changes under an existing revision conflict rather than silently upgrade existing runs. Historical admission-only and preparation/pause definitions remain immutable; newly added approval behavior requires a separately pinned literal revision. Historical authorized receipt reconciliation must not execute changed code or approve an old request for new behavior. New decisions bind exact unexpired pending evidence, original participants and current run revision; approval readies handoff without executing it.

Restricted runtime SQL requires forced row-level security, fixed-search-path guarded functions, explicit human/current-scope predicates, scoped composite foreign keys and immutable-table mutation/truncate guards. Public and application privileges are narrow; private participant/input rows are not general SELECT surfaces. Database context remains a trusted-server assertion, not cryptographic protection against stolen database credentials.

Current owner/reviewer bindings and grants are locked and revalidated before operation replay or effects. Locks cannot span a human pause or executor lifetime. Operation receipts remain separate from fresh inspection. Local effect identity belongs to run/step/effect slot, not attempt or lease. Fences prevent a stale executor from committing after cancellation or replacement.

## Revision4 continuation disposition

The parent's bounded resume amendment admits only literal revision4 and preserves historical1–3. Actual coordinator/API/gateway/executor/contract and025–028 bytes form the pin. Exact old start/advance/decision receipts remain historical under current original participants; they cannot execute changed code. Owner resume of old approved ready/handoff blocks definition_drift without effect; other old states conflict unchanged.

Resume admission/resumed event, handoff claim and atomic local completion are separate transactions. Claims bind the committed resume receipt; no replacement public key or approval renewal. The handoff links exact preparation/request/approving decision using scoped FKs and finishes terminal succeeded only after live authority, approval, pin, fence and database expiry checks. Force deferred constraints before the final expiry guard. Evidence and parent acceptance remain separate; no full-story closure follows.

## Revision5 cancellation disposition

New admission uses literal5 and actual025–029 source pin. Historical1–4 receipts use original stored digests and appropriate current authority; old4 handoff claims return NULL unchanged, even expired, and old valid-lease workers cannot finish. Cancellation is control-plane termination by any current scoped human administrator, not original-participant authorization or handler availability. Shared actor/key lock and strict envelope give exact immutable replay after current canceller recheck. One transaction advances runtime revision once and all three fences, clears leases/invocations/due, preserves completed evidence and records failed/cancelled for known zero effects or partial/cancelled after preparation. Terminal success conflicts unchanged; unknown acknowledgement reconciles without guessing absence. No semantic/work-item mutation or full-story closure.

## Revision6 inspection disposition

New admission uses literal6 with the actual025–030 source pin; historical1–5 definitions/migrations/receipts remain immutable. GET /api/runs/inspect uses current independent human audit:read authority at gateway/service/SQL, retaining authority locks and post-read checks but not original-participant authorization. A single MVCC evidence statement returns explicit stored provenance, runtime, step/effect/operation/request/decision and journal DTOs; no domain mutation or repair. Strict selectors, safe decimal cursors, extra-row ascending pagination, no-store and existing response ceilings apply.

Doctor examines complete bounded evidence with database time independently of the page. Persisted state and observed findings remain separate; inconsistent required approval/effect/journal links suppress completionVerified without rewriting a stored outcome. Missing installed source still permits authorized historical inspection with drift. Query failure is unknown/unavailable; authority-store failure remains forbidden. Genuine accepted5 export is pinned to939cfd8577d5e1cff2293f5d7b7a90f1d1754afb; old claims cannot execute changed code. Current-canceller historical control remains independent of participants. Inspection evidence does not close the remaining bounds/retry/expiry acceptance, Story12.3, Epic12 or all14.

## UX & Interaction Patterns

The initial implementation needs authenticated API evidence, not a new UI. Future inspection must preserve exact provenance, no-store disclosure and distinct denied, stale, unavailable, partial and unknown states. No board or desktop design decision is reopened by run work.

## Cross-Story Dependencies

Story 12.1 supplies the adopted detailed durable-runs-v1 contract. Current authority and persistence contracts from Epics 1–2 remain binding; existing memory/client behavior from Epics 3–11 must be preserved. Story 12.2 can be built in bounded vertical increments; start admission alone does not prove measured preparation, approval, continuation or Story 12.3 recovery.

Allura PostgreSQL is the sole writable operational-status owner; Notion remains planning only. Story 13.1 still owns precise work-item transactions/conflicts. Epic 14 is Linux-first, remote-connected to the existing server; secure connection/update/platform evidence stays separate. No tunnel or infrastructure work is required. Brain/status is unavailable and not retried under current authority; local test evidence is not remote governance, release or live status.

## Current local acceptance reconciliation — 2026-11-01 (additive)

This section supersedes earlier *current absence / pending local gate* descriptions above only; all historical revision sections and frozen specification intent remain intact. Parent adopts **accepted-with-open-items for the declared local Epic12 criteria** at `b6b34d9a10cf0b7985089b896e28afa387306805`. See the [current local retrospective](epic-12-local-retro-2026-11-01.md) for all twelve criteria, original receipt references and limitations. The [earlier partial retrospective](epic-12-retro-2026-10-31.md) remains unchanged and rejected for its earlier incomplete scope. No tracked-story or live operational status changes here.

The full fixed linear start → measured preparation → exact independent approval → fresh-process resume → linked PostgreSQL-local handoff is now locally exercised, with independent current administrator cancellation and audit-authorized inspection/doctor. Revision7 adds031 constraint drainage before the final real-database preparation age/original-lease/time guard. New admission requires literal7; historical1–6 preserve authorized original receipts without execution under changed code. Current cancellation/inspection survive original-participant revocation. No semantic promotion, automatic work-item move, external effect, arbitrary executor or parallel DAG follows.

Retained256 and natural journal128 have real boundary witnesses; exhausted boundary recovery uses reserved cancellation rather than invented capacity. Supported literal definition revisions1–7 are structurally tighter than16, not a claimed16th/17th admission. Accelerated historical admission timestamps are **not naturally elapsed24hours**. The rebuilt129-input artifact fits finite160-input/65536-byte-manifest/2MiB-input/32-asset limits with disclosed pre-read and symlink/TOCTOU limits; no guaranteed13/14 package fit.

New owned revision-one export lifecycle cleanup is accepted at `c5a952b4675462b04439b5a9fdf38e86a97dc8a6`; allocation/setup/provenance/callback/removal failure paths preserve primary errors and shared dependencies. The103 historical exports remain untouched, not evidence of an unfixed new-export leak.

The formerly pending gateway mandatory-name gate **passed** and is committed at the accepted baseline. Parent `allura-gateway-inventory-parent` records toolchain/full-check exit0, **580 cases / 23,170 assertions**, full594.694s and DB477.228s, no DB failure/skip/missing cases, unchanged source/dependencies/12 containers. Canonical log SHA256: `42da7bfcec54e2e7b1804b28964c44037f9948a16be69424cd20835101c141df`. These are parent execution receipts, not new tests in this documentation pass. Actual6.5/9.4, hosted/deployed/platform/actual-human and operational rollback remain separate and open; no all14 closure.

Story13.1 now has a bounded [adopted compatibility contract](../planning-artifacts/contracts/work-plane-compatibility-v1.md) and [specification](spec-13-1-work-plane-contract.md). Retained-main work-item routes/status graph/microsecond `expected_updated_at` are source capability only, not inherited beta implementation or live verification. Allura PostgreSQL alone remains writable work-status authority; Notion remains planning only. The [Epic13 packet](epic-13-context.md) names one next synthetic transition slice, no duplicate engine, automatic port, live grant, server/tunnel change or tracking mutation.
