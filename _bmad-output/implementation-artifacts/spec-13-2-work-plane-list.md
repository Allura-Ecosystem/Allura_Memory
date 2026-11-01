---
title: '13.2 bounded project work-item collection read'
type: feature
created: '2026-11-01'
status: locally-accepted-bounded-slice
final_byte_acceptance: 'Supersedes pending disposition below; metadata-only after final-byte runtime. Parent check:all exit0 662.109s SHA256 d27b2298414de4a5a7c1bb50a8fb694a47265bbedda8e93c85e809577df3f323 in workspace/allura-13-2-list-parent-final-byte. Unit216/5350assertions and DB413/21628assertions; DB540.409s, all batches below240s, outer900 retained. Source1450/dependencies14423 and12 containers preserved. Fowler delta review deleg_9b3183a6 approved exact one-byte EOF repair; original full reviews remain applicable. Two scanner findings rehashed against exact tokenizer model bytes, noncredential integrity pins; scanner/wrapper exit1 preserved, no clean-scan claim. Original failed whitespace attempt and all prior receipts retained. Parent native XML not retained; native-enforced log summaries used. Bounded list only, no full story/Epic/live/release acceptance.'
parent_acceptance_disposition: 'Supersedes the historical parent_acceptance claim below for final repaired bytes: pending canonical final-byte verification and independent parent readback. Parent staging stopped at foundation/tests/work-plane-list.test.ts:276 new blank line at EOF; no commit occurred and the exact eighteen files were unstaged without worktree loss. Original receipt, failed attempt and parent logs remain historical evidence. Authorized repair removes one redundant EOF newline only; no algorithm, case inventory or run revision changes. Fresh frozen repair evidence: /home/sabira/.hermes/profiles/troy/workspace/allura-13-2-list-evidence/repair-eof-final-byte/. The historical parent_acceptance field records pre-repair verification, not acceptance of these final bytes. No source edits after the repair freeze; final outcome belongs to its machine-verified receipt and subsequent independent parent verification.'
parent_acceptance: 'Post-verification metadata only; original frozen receipt and historical failures preserved. Parent check:toolchain/check:all exit0, canonical658.671s SHA256 f7bfe76608fd61b0f5e80fc8892f9b04a2e8af95bdb110d8977abed5c02b9b25. Evidence /home/sabira/.hermes/profiles/troy/workspace/allura-13-2-list-parent/. Unit33files216passes5350assertions; DB61files413passes21627assertions; zero fail/skip/missing, exact source-owned cases. Batches206.962/115.948/212.638s below240; measured DB537.163s below600, parent outer900 enforced (not separate DB600 subprocess timeout); worker standalone DB enforced600. Typecheck/lint passed. Actual offlineModelPrepared:true/publicModelPrepared:false; no public/cache-miss coverage. Parent XML not retained, source-enforced native summaries/logs reconciled; worker XML separately corroborates, never substituted. All1450source/14423dependency hashes preserved,12 original containers unchanged. Reviews deleg_486e7de0 and reconciliation deleg_c34b2350 approve. Parent scanner/wrapper remain exit1: precisely two generic-api-key findings core-release.test.ts49–50 are independently hashed tokenizer model integrity pins, zero unclassified; raw report SHA25617c0bb60667d9507306cb2d6e9400d73dced8328d24e92cd06b133659c1e644e. No full13.2/13.3/Epic13, human, live grants/migration/deployment or release acceptance.'
route: dispatch
baseline_commit: b4cacbe68db7b6334ad3b8c29110c867161cec77
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="Parent explicitly adopted the complete scoped list packet">

## Intent

Implement the existing versioned collection GET for an already mapped synthetic project, with current human read authority and bounded authenticated keyset pagination. This is a backend dependency, not full Story13.2 or Epic13 completion.

The complete admitted design, exact eighteen-file allowlist and thirteen case identities are frozen in the parent packet `allura-epic13-scout-next-list-packet-862d145fd7da.md`, SHA256 `dc4b06f685441712747c5582c0aa2cf39dead1aa5acc6c3d7c1b0964e02a1bbf`. Its full256 lines were read and hash verified before edits. Preserve every requirement, including sensitivity controls, genuine accepted-source upgrade evidence and canonical inventory ownership.

## Boundaries & Constraints

Always: same gateway/admission counter; exact v1 header; required unique decoded group/workspace/project selectors; optional unique status/lane/limit/cursor only; fatal percent/UTF8 validation before lossy query decoding. Opaque IDs and microsecond tokens are preserved. Default/max100, minimum1, canonical decimal limits. Stable descending created_at then C-collated ID keyset; at most limit+1 SQL rows. Envelope work_items/has_more/next_cursor, no total or cross-page snapshot guarantee. HMAC-SHA256 cursor domain `allura-work-list-cursor-v1`, finite900000ms TTL, canonical base64url and strict fields; binds original principal, contract, scope, project, immutable authority mapping and normalized filters/limit. Recheck current authority, work:read, mapping and original principal at service/disclosure. No read side effects.

Never: gateway or run-pin edits, mutations/provisioning/UI/lanes/evidence/handoffs; default permission expansion; migration001–033 edits; dependency/cache/history rewrites; deployment/live credentials/MCP/network; staging/commit/refs; story closure. Revision8 bundle remains `fdb1a89fa08178acc34f17cf3fd30eec76cda240fc003377f6dfcdf37e7b6d84`. New034 adds read functions only. Parent owns independent review/reproduction.

## I/O & Edge-Case Matrix

| State/input | Expected |
|---|---|
| Current scoped human, explicit read, mapped populated project |200 bounded ordered exact work snapshots; authenticated continuation only when more observed |
| Mapped empty project |200 empty, false, null |
| Missing/inactive/foreign/wrong-authority project | Indistinguishable404 |
| Malformed query/header/cursor |400, no private echo |
| Valid nonempty unsupported lane |404 after scope/project admission |
| Lost current authority/binding or expired identity |403/401, cursor grants nothing |
| Mapping/backend failure, response overflow |503 unknown, no partial success |
| Concurrent insert/transition between pages | Current bounded pages, not snapshot/total |

</frozen-after-approval>

## Code Map

- `foundation/src/work-plane-api.ts`: existing route factory and hooks; add static collection without changing dynamic routes.
- `foundation/src/work-plane.ts`: scopedTransaction/originalPrincipal/work guards and failure mapping; additive list service only.
- `foundation/src/work-plane-contract.ts`: reuse workText/workToken/workGraph; strict new selectors/cursor contract.
- `foundation/migrations/034-work-plane-list.sql`: additive guarded project resolver and bounded read, reuse work_snapshot; `persistence.ts` registration only.
- `foundation/src/core-api.ts`: existing cursorKey composition only.
- `foundation/tests/work-plane-list.test.ts`: ten exact packet cases, native signed HTTP/restricted SQL, owned fixtures.
- Existing contract/HTTP/recovery/core-release/run-upgrade test files and scripts: exact packet-limited assertion/inventory additions. No runner algorithm/budget changes.

## Tasks & Acceptance

- [x] First real signed HTTP404→200 tracer with accepted working controls before production edits.
- [x] Strict selector/cursor/parser/service/SQL cases, all ten DB and three appended unit names exactly as packet.
- [x] Both attributable revocation orders, original binding/disclosure, pooled isolation, honest bounds/no writes.
- [x] Genuine accepted baseline populated upgrade, revision8 compatibility, restored/repacked collection controls.
- [x] Owned source-export project/guard mutants fail real tests, restored controls pass.
- [ ] Canonical toolchain/unit/typecheck/lint/test:db/check:all with exact native ownership and frozen source; preserve raw failures and complete receipts.

Given accepted current authority and a mapped project, when collection GET executes, then results obey the matrix and no work/semantic/run history changes. Given any authority loss or foreign/corrupt selector, when attempted, then deny without disclosure. Given migration034 over genuine accepted populated code, when upgraded, then old history and revision8 execution remain intact.

## Implementation Notes

Admission clean exact baseline,034 absent, direct-build STOP absent. Installed build renderer executed successfully. Current adapter and supplied parent scope supersede historical runtime/MCP/status/staging/delegation instructions; no nested agents or status writes. Existing Epic13 context is historical continuity, not regenerated or treated as fresh acceptance. Evidence directory: `/home/sabira/.hermes/profiles/troy/workspace/allura-13-2-list-evidence/woz-20261101T172909Z`.

## Spec Change Log

No adopted design or file-scope changes. Additive read-only034, unchanged1–33 and revision8 bundle. Verification strengthened exact131072-byte response edge,16/5000ms admission lifetime, genuinely signed identity expiry, and empty terminal page. No budget or test-floor changes.

## Review Triage Log

Direct Woz self-check only: inspected complete owned diff and actual production guards/parser/SQL/package/recovery paths against admitted packet. No independent reviewer claim; parent performs independent review/reproduction. Corrected shifted canonical inventory slice, authenticated the genuine-upgrade fixture through current code rather than reusing another exported module's identity brand, and added signed-expiry controls. Initial signed-expiry fixture omitted mandatory email and failed unauthenticated; preserved failure, corrected synthetic fixture, reran all ten. No production workaround or dropped assertion.

## Verification

Use installed pinned Bun/Node. Every packed/core/canonical command explicitly sets `ALLURA_TEST_OFFLINE_PACKAGE_CACHE=/home/sabira/.hermes/profiles/troy/cache/scratch/allura-core-dependency-cache`; require offlineModelPrepared:true/publicModelPrepared:false. Gates: check:toolchain; focused observed RED/GREEN; test; typecheck; lint; test:db; check:all. Preserve240s batch/600s DB/900s outer budgets. Freeze all tracked/untracked source before final gates and compare afterward. No focused double counting. Preserve scanner raw exit1 with exact-source model-pin classification, not fabricated exit0.


### Observed pre-freeze receipts

All artifacts below are in the evidence directory above, with original logs/native XML retained.

- `first-red`: actual signed collection404 vs required200; existing item200/exact microseconds, context200/org403, disabled404 and machine-only404 controls passed. Exit1,1 fail,8 assertions. `first-green`: same feature passed. These are behavior observations, not an import/setup failure.
- `check-first` failed on one stale inventory tail slice; original output retained. `check-restored` exit0, unit33 files/216 cases, distinct typecheck and lint. No assertion floors or runner algorithms weakened.
- `project-mutant` and `guard-mutant`: independently altered only owned export SQL, real registered isolation case exit1; each restored control exit0. Canonical source unchanged; export removed. `mutants.json` binds the source and raw logs. Final-source repeat will be retained separately.
- `db-first`: canonical exit0,61 files/413 cases/21620 assertions, no fail/skip/missing; native three batches retained; elapsed536.096s within600s. This preceded the additional signed-expiry/terminal-empty controls and is not the final frozen-byte receipt.
- `coverage-final` preserves the expired-JWT fixture failure. `coverage-restored`: all10 DB cases pass,1271 assertions, zero failures. Focused counts are not added to canonical totals.
- Final authoritative frozen receipts: `frozen-source.json`, `candidate.diff`, `db-final.execution.json`, `check-all-final.execution.json`, native XML, `scan-receipt.json`, and `final-receipt.json`. This spec freezes before those commands; only a successful machine-verified final receipt constitutes final-byte verification. No source edit after freeze is allowed.

### Bounded partial retrospective

The exact first signed route witness prevented setup failures from masquerading as RED. Separate current identity branding matters when genuine accepted code and current code coexist in one upgrade test. Read-only SQL still needs project and entitlement sensitivity mutants. Exact response/time/admission tests belong on the actual common gateway, not a substitute counter. Canonical source-owned inventory and native XML are separate evidence; preserve both and do not add focused runs to canonical totals.

No full13.2/13.3/Epic13 completion, independent review, live status, grants, deployment, production migration, public-model download, human acceptance, stage/commit or ref change is claimed. Historical export membership was captured at admission; byte fingerprints were added after focused checks and before canonical gates. Existing103 run-upgrade exports and other historical upgrade exports are preserved. Parent retains review/reproduction/commit authority.

## Frozen exact file and case ownership

| File | Permitted change only |
|---|---|
| `foundation/migrations/034-work-plane-list.sql` NEW | Add guarded project-map/list read functions and narrow EXECUTE grants; no rewrite of032/033, existing work tables, run functions or historical evidence. Fixed search_path; retain forced RLS/no direct table privileges. Verify all stored data unchanged by migration |
| `foundation/src/work-plane-contract.ts` | Strict list selector/cursor-data validation helpers/types and finite bounds; preserve transition parser/graph semantics |
| `foundation/src/work-plane.ts` | Current-human list service, scoped project admission/recheck, cursor binding/verification and read-only query integration. Retain transition/current-item behavior |
| `foundation/src/work-plane-api.ts` | Add existing static collection GET, strict query/header validation, current work/project disclosure and serialize page; accept cursorKey for list only; retain both dynamic routes and flat transition parser |
| `foundation/src/core-api.ts` | Pass the existing cursorKey to createWorkRoutes within the same composition/counter; no other route/identity behavior |
| `foundation/src/persistence.ts` | Append exactly034 filename to migration registration; leave transaction/authority machinery unchanged |
| `foundation/tests/work-plane-list.test.ts` NEW | Ten exact registered DB/HTTP cases below, using existing fixture; own any new synthetic setup locally |
| `foundation/tests/work-plane-contract.test.ts` | Append three exact pure selector/cursor contract cases below; retain original three and assertion floor |
| `foundation/tests/work-plane-http.test.ts` | Adapt direct createWorkRoutes fixture calls only if signature requires synthetic cursor key; update line284's collection-without-project expectation from404 to400 invalid now enabled; retain explicit disabled404 controls and every old case/behavior |
| `foundation/scripts/test-db.ts` | Append one new suite with ten exact names; preserve all existing names, suite order, three batch cutoffs, lifecycle, budgets and no selector override |
| `foundation/scripts/test.ts` | Append three exact case identities to existing work-plane-contract suite; retain all old cases/floors and runner implementation |
| `foundation/tests/test-runner.test.ts` | Exact inventory totals/batch-last-slice updates and inclusion checks for new names; retain old once-only enforcement and every negative test; no runner algorithm change |
| `foundation/tests/recovery.test.ts` | Current inventory33→34 plus exact034 digest, keep033 digest/corruption checks and add034 missing/corrupt rejection; restored populated restricted list proof, while preserving all old snapshots/replay/embedding witnesses |
| `foundation/tests/core-release.test.ts` | Exact current count33→34; verify new migration/package bytes and packed collection read/disabled behavior using existing offline fixture. Preserve033 strict path/integrity negatives, pinned model inputs/cache-only installation and bounds |
| `foundation/tests/run-upgrade.test.ts` | Only post-current-migrate count at inspected line39:33→34; preserve old fixture25 and run revision8/history behavior |
| `foundation/tests/run-age-upgrade.test.ts` | Only post-current-migrate count at inspected line66:33→34; preserve genuine6 fixture30, source pin, historical claims and all run behavior |
| `foundation/tests/run-work-plane-upgrade.test.ts` | Only post-current-migrate count at inspected line66:33→34; preserve genuine7 fixture32, source pin and revision8 semantics |
| `_bmad-output/implementation-artifacts/spec-13-2-work-plane-list.md` NEW | Frozen bounded intent, exact names/allowlist, actual RED/GREEN/fault/canonical receipts and limits; not live work status |

Ten native DB cases, in order:

- `work list signed HTTP returns scoped ordered items and an authenticated next cursor`
- `work list empty mapped project filters exact microseconds and stable ties remain bounded`
- `work list strict selectors versions malformed encoding and unsupported lanes fail closed`
- `work list cursor binds principal scope project filters mapping and expiry without disclosure`
- `work list current read entitlement original binding and authenticated machine denials remain enforced`
- `work list authority entitlement and mapping revocation serialize in both attributable orders`
- `work list restricted SQL foreign projects and pooled reuse cannot disclose or write state`
- `work list concurrent transitions and inserts preserve honest current page semantics without history writes`
- `work list response target and service failure bounds never masquerade as a complete board`
- `work list additive migration preserves accepted history and the exact revision eight run bundle`

Three appended unit cases, in order:

- `work list contract preserves exact selectors limits statuses and opaque identifiers`
- `work list contract rejects duplicate malformed and unsupported selector values without normalization`
- `work list cursor contract enforces canonical authenticated binding tuple and finite expiry`
