---
epic: 13
artifact: context-and-first-implementation-packet
date: '2026-11-01'
design_contract: work-plane-compatibility-v1
baseline_commit: b6b34d9a10cf0b7985089b896e28afa387306805
artifact_state: frozen-documentation-candidate
implementation_performed: false
story_status_mutated: false
live_status: unknown
---

# Epic13 context — compatible PostgreSQL work plane

## Goal and current dependency

One governed Allura PostgreSQL work plane, not a second engine. Notion is planning only. Preserve retained work-item route vocabulary, opaque IDs, exact graph and microsecond `expected_updated_at`; add explicit current human work permissions, project/workspace ownership and atomic event/receipt semantics. Run outcomes, semantic reviews and documentation labels never move work status automatically.

[13.1](spec-13-1-work-plane-contract.md) and [work-plane-compatibility-v1](../planning-artifacts/contracts/work-plane-compatibility-v1.md) contain the adopted engineering contract. [Epic12 local retrospective](epic-12-local-retro-2026-11-01.md) records parent accepted-with-open-items at the baseline with the final gateway registration **passed**. This is enough for independently safe local continuation; actual6.5/9.4, live status capability, deployed/hosted/actual-human/platform acceptance remain separate and unperformed here.

Retained `/home/sabira/Allura_Memory-main` is read-only source reconnaissance, not an implementation target or deployed capability. Its latest observed revision is `8a831884e0f7570c453846cec4c90381a9a22ba4`. No main port, live mapping or source-only authority grant is implied.

## Stories and boundaries (not a tracker)

- **13.1:** source-grounded compatibility and authority/conflict/receipt design is adopted locally in this document packet; no tracked story closure.
- **13.2:** implement governed projects/items/handoffs/evidence through bounded sequential slices; first packet below is guarded existing-item transition/readback only.
- **13.3:** later mission-first workspace/evidence inspector, exact retained UX, authorization, stale/unknown and one-way planning boundary evidence. No UI or desktop work in the first packet.

## Immediate13.2 packet — one guarded transition and exact readback

**Owner:** one parent-admitted Woz canonical writer in `/home/sabira/Allura_Memory-beta-local`; Brooks supplies this contract. No concurrent writer, nested agent, main-checkout edits, staging/commit/refs, live grants or network by the bounded builder unless parent separately grants them. Parent owns candidate acceptance/commit. This is an implementation plan, **not implementation or a standing permission to mutate a live database**.

### Observable first gate

Native restricted-PostgreSQL test named:

`work plane ready transition commits one exact event receipt and microsecond token`

Fixture: synthetic mapped project and existing TEXT-ID item in `ready`; two current bound humans with explicit same-workspace `work:read`/`work:write`; another tenant/workspace, human without entitlement, machine and revoked human controls. Start from genuine canonical migrations and existing signed-identity/scoped transaction helpers. Owner connection may install synthetic fixtures and narrowly owned fault triggers only; actual service/read assertions use restricted `allura_app`.

Input: current exact six-digit token, one operation key, resolved matching actor, `to_status: in_progress`, no evidence. Expected: one immutable event/receipt and accepted snapshot, strictly greater six-digit token, authoritative service readback `in_progress`; same-key replay returns original bytes unchanged. Other scope and semantic/run tables remain byte-identical. There is no work service at the baseline: first failing feature witness must record **feature absence** explicitly, not claim an existing product regression. Do not count a missing import, broken fixture, no-test discovery or unavailable DB as behavioral RED. Once the production command exists, prove genuine fault sensitivity by removing only its atomic event/receipt guard in an owned source export and observing the fault test fail, then restore/retest; no canonical source mutation for the negative control.

Start by writing/running this bounded test against the admitted baseline, then the minimal additive service/SQL implementation. Do not run a generic planning restart. A service-only GREEN is a checkpoint, not full13.2 acceptance.

### Allowed files for the first builder (future parent admission)

This publication pass does **not** edit any of these product files. Parent rechecks next migration slot at builder admission; currently001–031 exist. If032 is no longer next, stop for the exact filename disposition, never renumber history.

| Path | Narrow permitted purpose |
|---|---|
| `foundation/migrations/032-work-plane.sql` (new, conditional on free slot) | Add scoped work entitlements, immutable authority-instance/project mapping, minimum project/item state, immutable event/receipt tables and guarded transition/read functions. Forced RLS, scoped FKs, narrow privileges, no old migration rewrite or automatic legacy import. |
| `foundation/src/work-plane-contract.ts` (new) | Strict service DTO/status/token/digest envelope/error definitions, exact finite bounds; no HTTP implementation yet. |
| `foundation/src/work-plane.ts` (new) | Current-human work guard, existing scopedTransaction integration, atomic transition, immutable replay and authorized current readback. No executor/daemon/network or parallel authority. |
| `foundation/src/persistence.ts` | Append exactly the new migration filename; retain existing transaction/authority implementation bytes. |
| `foundation/tests/work-plane.test.ts` (new) | Named restricted DB positive, permission/mapping/state/concurrency/fault/replay cases below and owned fixture lifecycle. |
| `foundation/tests/work-plane-contract.test.ts` (new) | Exact graph/token/DTO/digest vectors and finite boundaries without mock success assertions. |
| `foundation/scripts/test-db.ts`, `foundation/scripts/test.ts` | Append exact named cases once in the existing canonical lanes; no runner algorithm, selector, batch budget, required-case removal or floor relaxation. |
| `foundation/tests/test-runner.test.ts`, `foundation/src/ci-contract.ts` | Only exact dependent inventory assertions required by new registered suites. Preserve old required identities, including gateway mixed-identity case. |
| `foundation/tests/recovery.test.ts` | Exact migration inventory and populated work state/event/receipt preservation, while retaining all prior evidence checks. |
| `_bmad-output/implementation-artifacts/spec-13-2-work-plane-transition.md` (new) | Future bounded intent, RED/GREEN/fault evidence, source freeze, acceptance limits. Not a live status ledger. |

No `gateway.ts`, `core-api.ts`, `run-contract.ts`, runs/API/executor, migrations001–031, auth/client-role changes, core package widening, dependency/lockfile changes, protected UX, catalog or retrospective rewrites in this first slice. Package and recovery integration still must pass current canonical gates: if a real new dependency cannot fit this list or finite package limit, report that exact dependency and obtain a bounded extension before editing. Do not raise limits, drop recovery tests or call partial tests full acceptance.

### Single canonical writer execution sequence

1. Parent admits exact clean revision and freezes the named allowlist; builder checks direct-build STOP before writes and takes source/dependency/index/HEAD fingerprints. No main data/credential or live ownership lookup. Use existing installed build workflow through the repository adapter and current supplied scope.
2. Run the named feature-absence RED with a working fixture and nonzero native case discovery; retain raw outcome, not a fabricated transition. Implement only minimum new guarded service/SQL schema. Mapping and entitlements are explicit synthetic owner fixtures; there is no public provisioning or import flow.
3. Demonstrate positive `ready → in_progress`, immutable receipt/current read separation, exact replay, and strict microsecond advancement (including same-transaction/clock-regression fixture). Show raw service receipt byte equality and do not call it HTTP proof.
4. Extend in the same bounded slice to the cases below; real restricted-role effects, separate connections/processes for concurrency, attributable lock waits for revocation. Keep wrong-fixture attempts and failures in evidence. An unsupported changed command literal proves rejection only, not shared-key serialization across two implemented commands. Defer that broader runtime claim until another command exists; do not implement additional command APIs to fake scope coverage.
5. Add exact canonical inventory, populated recovery and real negative-control sensitivity. Run current toolchain, focused native tests, full canonical unit/compiler/lint/DB/pack/recovery gates under existing budgets. Register every required named case before acceptance; counts alone are not name enforcement. Do not duplicate focused runs into totals.
6. Freeze source/diff and exact command/count/hash/preservation/cleanup evidence for parent review/reproduction. Parent owns disposition and local commit. No tracked-story closure, live status, hosted/deployed acceptance or entire Epic13 claim.

### Required first-slice behavioral witnesses

- Two different commands from the same token: one accepted transition, one unchanged409; concurrent exact same-key calls: one event/receipt; same-key changed token/state/payload:409. Exact replay after later progress returns original snapshot and receipt, while authorized current read differs.
- Invalid graph, fresh same-state, terminal reopen, stale token and unsupported evidence all leave state/history unchanged. Preserve non-UUID TEXT IDs exactly and prove six-digit precision across service serialization, including tokens differing only below millisecond precision.
- Explicit work permission absent/revoked, org-only admin, machine/device/owner-linked/selected client, mismatched actor, inactive/missing/foreign/ambiguous map and wrong workspace deny with no success receipt/private echo. Base `memory:read` alone must fail work read and write. Prove unsupported existing mapping fails closed rather than defaulting to a workspace.
- Existing principal/binding/tenant/member/workspace/grant and new work-entitlement revocation both actual DB orders; observed waiter/blocker PIDs, no sleeps-only ordering claim. Recheck after lock wait and before response. Pool A→B→absent scope does not retain access.
- Fault before state/event/receipt writes, after each boundary, deferred constraint failure and terminated backend: all-or-nothing state/token/event/receipt. After ambiguous committed acknowledgement, a fresh process reconciles the same key. Service connection-loss evidence is not signed HTTP lost-response proof.
- Restricted application cannot insert unauthorized mappings/grants, mutate/truncate immutable history or bypass forced RLS/private helpers; scoped FK splice fails. Known rollback and unknown stay distinct; private reason/IDs/tokens never escape denied errors/logs.
- Retained operation cap and max DTO bounds fail unchanged, exact replay still works at cap; semantic/run/foreign snapshots unchanged. Own and remove only synthetic fixtures/exports/containers allocated by the builder, verify exact absence; retain all historical103 exports.

### Next dependency after service acceptance — not included now

The retained dynamic route names cannot be implemented by simple addition to current `core-api.ts`: gateway is exact-static-path, JSON.parse erases duplicate keys, typed replies exclude201, and domain errors need mapping. Its bytes are pinned by run revision7. Contract §8 therefore requires a **separately admitted gateway/wire-and-run-pin packet**, not a hidden edit or duplicate gateway with its own admission counter. That packet must adopt the exact next immutable run-definition compatibility rules before changing pinned bytes and preserve all historical receipts/old-executor fencing. It then proves signed HTTP dynamic routes, version/header/query/body equality, duplicate-key rejection, typed status/error behavior, no-body-work mixed identity denial, real lost-response reconciliation and no-store current readback. No fresh server, Notion write or live deployment is required for those synthetic witnesses.

Only afterward admit create/project/lane provisioning, exact evidence and recipient-bound handoffs as individually scoped13.2 packets, followed by13.3 protected UI parity. Never infer these from transition success. Live legacy ownership/cutover, actual work grants and endpoint/version evidence remain a separate authorized boundary; missing live mapping does not block the synthetic service slice and cannot be bypassed to enable real items.
