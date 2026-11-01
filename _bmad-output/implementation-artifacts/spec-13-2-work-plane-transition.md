---
title: '13.2 guarded work-item transition and authoritative service readback'
story: '13.2'
route: dispatch
artifact_state: locally-accepted-bounded-service
parent_acceptance: 'Parent check:toolchain/check:all exit0; canonical SHA256 3c59e392ff203b3867a1bd98ec3525f61b368ffb764413f238a351c140ab822f. Evidence /home/sabira/.hermes/profiles/troy/workspace/allura-13-2-transition-parent. Source/dependencies preserved,12 containers unchanged,scan0. Pike/Fowler bounded source/log reviews approved; parent independently reproduced. HTTP, live mapping/grants, full13.2/Epic13 and external acceptance remain open.'
baseline_commit: c244c684ae9ce409d76bd4c77427248b02dea6f1
story_status_mutated: false
live_status: unknown
context: ['epic-13-context.md', '../planning-artifacts/contracts/work-plane-compatibility-v1.md']
---

# Bounded service/SQL candidate

<frozen-after-approval>
## Intent

Implement the first [13.2 packet](epic-13-context.md), under the adopted [compatibility contract](../planning-artifacts/contracts/work-plane-compatibility-v1.md): an explicitly entitled current human transitions an already mapped opaque-TEXT work item using its exact six-digit PostgreSQL token. State, one immutable event and one immutable receipt/accepted snapshot commit together. Exact-key replay returns original bytes; a separately authorized read returns current state.

Only the packet allowlist plus the parent's exact current migration-count 31→32 extensions in run-upgrade, run-age-upgrade and core-release tests is admitted. Preserve historical counts, run pins, authority role defaults, old migrations, gateway, dependencies, package limits, UX and common fixture. Owner installation is synthetic/disposable only. No public provisioning, import, HTTP, live credentials, network/MCP, staging, commit, refs, story closure or nested agents.

## Tasks & Acceptance

- Given a genuine restricted fixture, record the first named feature-absence RED, not an import or database error; then prove one transition, exact microseconds, event/receipt and readback.
- Given current base authority plus explicit work permissions, lock and revalidate at SQL and service boundaries. Reject missing/revoked permissions, nonhuman identities, actor mismatch, unsupported/foreign mapping, stale tokens, invalid graph and unsupported evidence without private echoes or effects.
- Given concurrent commands, accept one winner per token and one receipt per exact key; distinguish immutable replay from later current state. Changed same-key content conflicts; an unsupported command literal is rejection, not two-command serialization proof.
- Given write/deferred failures, silent event loss or backend termination, preserve atomic state/history; distinguish confirmed rollback from uncertainty. Reconcile a withheld post-commit acknowledgement in a fresh process using the same key.
- Given authority/entitlement revocation in either database order, observe exact waiter/blocker PIDs, recheck after waiting and deny subsequent disclosure. Preserve scope across pooled reuse.
- Given finite retained operations and DTO bounds, refuse overflow without effects while allowing exact replay at capacity. Preserve semantic/run/foreign snapshots and populated recovery.
- Require complete canonical registered names, native reports, typecheck/lint, DB/pack/recovery, guard-removal sensitivity in an owned export, final source/dependency/container preservation and cleanup receipts. Parent reviews/reproduces; no self-issued complete13.2 or Epic13 claim.
</frozen-after-approval>

## Code Map and implementation limits

- `foundation/migrations/032-work-plane.sql`: singleton owner identity, scoped entitlements, immutable project ownership, item model, append-only event/receipt relations, deferred scoped foreign keys, fixed-search-path guards and bounded transitions. Application has no direct table privileges; all tables force RLS. Historical unsupported lane/owner/team/run links are unavailable, not inferred.
- `foundation/src/work-plane-contract.ts`: exact service DTO/token validation; raw JSON strings are rejected. Duplicate-key HTTP decoding is explicitly the later gateway packet, not claimed here.
- `foundation/src/work-plane.ts`: existing `scopedTransaction(memory:read)` plus mandatory independent work guard, forced deferred constraints, confirmed-commit return and fresh disclosure authorization. No parallel role system.
- Only append migration registration in persistence. Exact unit/DB registrations and dependent inventories retain all old names/budgets. Recovery retains old witnesses and adds populated work state/history and restricted replay/readback.

## Evidence and disposition

Evidence directory: `/home/sabira/.hermes/profiles/troy/workspace/allura-13-2-transition-evidence/resume-01` (private execution evidence, not a work-status board). The original admission and prior no-edit blocker receipt remain unchanged.

Observed first RED: `red-01.log`, one native case, three assertions, working current-authority/restricted-role fixture, explicit absent work service. First positive GREEN: `green-02.log`. Subsequent negative RED exposed Bun PostgreSQL SQLSTATE mapping; later REDs exposed reason-byte and JSON-depth constraints. Wrong-fixture attempts, timeout, and earlier failures are retained, never counted as successful acceptance.

Final immutable receipt in that directory binds actual commands, final source hashes, canonical native counts, mutant/control results, cleanup and preservation. This spec does not predeclare those gates passing. Service-only evidence does not cover signed HTTP, actual lost HTTP responses, live mapping/grants, gateway/run-pin changes, public create/evidence/handoffs, protected UI, deployed/hosted/platform acceptance or all of13.2. Parent owns final disposition and commit.
