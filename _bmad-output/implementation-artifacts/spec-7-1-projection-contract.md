---
title: Story7.1 confirmed projection authority and reconciliation contract
type: feature
created: 2026-10-27
status: done
route: dispatch
baseline_commit: 714e24303de3785ff8fa327b95397fe9b6b6acbb
context: []
---
<frozen-after-approval>
## Intent
Define the concrete source/destination/digest/read-back/retry boundary for adopted local projection, before7.2 durable implementation. Preserve checkpointed10.1 rather than discard it. This story settles delegated engineering choices, not actual external target or credential authority.

## Boundaries & Constraints
Always preserve DOC-07/DOC-J09/DEV-AC05/BE-AC06, immutable decision receipts and current explicit transfer authority. Authentication/authorization is separate from pure shape validation. Notion page access is not transfer approval. Only approved immutable semantic content may project; no raw evidence/proposal/secret export. No actual external write, credential lookup, new grants, production migration/deployment, push or source restoration. Independent human promotion stays mandatory; no developer-review agents.

## I/O & Edge-Case Matrix
| Scenario | Input / state | Expected behavior |
|---|---|---|
| Exact destination | Pinned adapter/origin/page/data-source/property identities | Immutable bounded descriptor; no URL/path inference |
| Malicious destination | URL credentials/query/fragment, foreign origins, duplicate properties, scope/authority injection | Fixed invalid error, no secret echo |
| Source binding | Exact authorized scope/semantic version/decision/version/content | Deterministic scoped digest and immutable binding; change any identity/content changes digest |
| Notion content | Well-formed exact Unicode text through bounded plain rich-text chunks | No trimming/newline/NFC transformation; full reconstructed content compared, not just claimed digest |
| Read-back | Correct page/parent/properties/binding and content | match; blank reserved properties empty; missing/malformed/foreign/changed content conflict; HTTP acknowledgement alone provides no evidence |
| Retry claim | Due/unleased/under cap/current authorized | First claim may pre-read then write; after durable write_started only reconcile; synced/terminal/not-due/exhausted/unauthorized not claimable |
</frozen-after-approval>

## Code Map
- `foundation/src/authority.ts`: existing signed/current scope/action contract; parse helpers never grant it.
- `foundation/src/decisions.ts`, `migrations/005-decisions.sql`: immutable decision/semantic/intents; do not mutate old migrations or receipts.
- New `foundation/src/projection-contract.ts` and `tests/projection-contract.test.ts`: bounded descriptor/envelope/Notion properties/read-back/claim primitives.
- `foundation/scripts/test.ts`, `src/ci-contract.ts`: mandatory nonzero suite discovery.
- New `../planning-artifacts/contracts/projection-v1.md`: concrete7.2 durable transfer/claim/observation contract and local-vs-external boundary.

## Tasks & Acceptance
- [x] Record exact destination discovery and delegated authority/transaction/read/retry contract. Given absence of target-scoped approval, all runtime exercises use owned local fixtures only.
- [x] Implement matrix tests red first, then contract primitives. Given changed source/destination/content, read-back never returns match; opaque HTTP success is not a read-back.
- [x] Enforce discovered unit case/assertion counts plus typecheck/lint/full tests. Given unknown write completion, claim policy never permits another write.
- [x] Direct self-check and source-bound acceptance. Given passing contract tests, claim7.1 only, never durable receiver or actual external acceptance.

## Design Notes
Notion intent is documented; no authorized target found in inspected current planning. Brain recall unavailable, not proof of absent history. Official update/retrieve/request-limits docs retrieved2026-10-27 identify API2026-03-11, PATCH/GET existing page and2000-character rich-text chunks. Use pre-provisioned page in exact data source with two dedicated rich-text property IDs (content/binding), no page creation/block append/delete. This avoids duplicate page creation; remote concurrent editors lack compare-and-set and remain a release hazard requiring an exclusive destination policy. No invented Notion CAS/idempotency support.

## Implementation Notes
Brooks/Woz actual guidance loaded in sole worker; native build render/resolvers executed. Correct Course adopts local7 and prioritizes it. Bounds are conservative engineering ceilings, not product SLOs. Story7.2 persists claims/fences before any outbound intent;7.3 proves actual local transport/restart/unknown behavior.

## Verification
`bun test tests/projection-contract.test.ts` red/green, `bun run check:all`, exact-source CI after local commit. Raw logs in direct-build Operations admission25 files. No browser UI change in7.1.

Local contract acceptance2026-10-28 admission26: all23 inherited hashes plus exact parent-owned README verified before execution. Actual `bun run check:all` exited0 at00:31:39-04:00,203tests/2002assertions plus579 browser assertions;7.1 contributes4cases/88assertions. Raw log `admission26-preflight-full.log`; no failure/skip/missing cases. Admission25 STOP refusal was not a DB pass; this rerun supplies that evidence. Direct source/test/contract self-check only, no independent developer reviewers.7.2/7.3 persistence/transport and actual external acceptance remain unperformed. Parent-owned untracked README and remote README-only commit are preserved; clean-revision CI/publication reconciliation remains a separately authorized handoff, not silently bypassed or required to overwrite another owner's file. This done marker accepts local7.1 contract scope, not a release or Allura operational status.
