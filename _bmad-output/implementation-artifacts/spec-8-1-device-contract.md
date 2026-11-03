---
title: '8.1 Device enrollment and current-authority contract'
type: feature
created: 2026-10-27
status: done
route: dispatch
baseline_commit: bc5c23b2e1126b65c2abdb5c75a7cd37f2f5af7d
---
# Intent

Specify executable bounded device inputs and current-authority invariants before8.2 storage/HTTP. Sources: catalog8.1, AD-69, NFR-4, ENT-03/04, [authority-v1](../planning-artifacts/contracts/authority-v1.md). Approved [Correct Course](../planning-artifacts/sprint-change-proposal-2026-10-27.md) permits local8 despite open6.5 release requirements. Brooks design, Woz implementation guidance in sole writer; direct self-checks, no independent developer review.

## Design defaults, not historical user mandates

Authenticated human enrollment on a currently granted workspace; separate explicit current workspace-admin approval; device completion bound to owner and a256-bit verifier commitment. No anonymous pairing/poll endpoint, short guessable code, browser role minting or human JWT converted into machine identity. Device remains kind=device with separate opaque credential. Proposal semantic approval remains human-only. Owner may approve a device only if already an explicitly granted human workspace admin; this is device administration, not semantic promotion or self-grant to the human.

- Ten-minute enrollment deadline, thirty-day credential expiry, at most8 active/pending devices per owner/workspace. Bounded engineering defaults, not product SLOs. Zero offline/revocation/expiry grace: reconnect rechecks current authority; expired/revoked credential requires sign_in_required and explicit enrollment/rotation, not silent credential resurrection.
- Requested/approved actions are nonempty unique subsets of memory:read, memory:capture, proposal:write, review:read and must include memory:read. Device grant at most curator; effective actions intersect approved ceiling and CURRENT owner role/grant/membership/identity-binding plus device and workspace state. No review:approve, raw evidence, delete, audit/admin/grant powers; no new implicit org-admin content grant.
- Client generates256-bit canonical base64url verifier and future credential separately. Begin stores SHA256 verifier challenge and operation-key/digest; complete verifies proof, persists only credential SHA256, and returns public receipt, never another secret. Client must securely persist pending verifier/token before exchange;8.3 proves actual OS store, not in-memory substitute. No secrets in args/URL/log/audit. HTTPS except explicit owned loopback fixtures.
- Human owner initiates and completes; currently authorized admin approves exact revision/actions; completion rechecks both humans, binding, membership, grant, workspace lock, deadline and proof. Create device principal+membership+grant+owner link+credential+immutable public receipt/audit atomically. Exact retry same key/payload reconciles, changed payload conflicts; completed exchange with same proof/digest returns same public receipt while current authority/deadline permits. Proof cannot mint a second credential.
- Rotation requires signed current owner (not an expired bearer), exact generation and stable operation key. Client pre-stores a separate replacement token; atomic old revocation/new digest/generation/audit/receipt. Same-key replay returns original PUBLIC receipt only, never reactivates a revoked generation. Revoke by current owner or explicit workspace admin; terminal/replay safe, all credentials revoked. Unlocked/regranted owner may resume an unexpired unrevoked device, never an explicitly revoked one.
- Transactions lock current owner/device authority and credential generation; delayed approval, demotion/removal, competing completion/rotation/revocation cannot broaden access. Privacy-safe foreign/missing not_found, malformed invalid, stale conflict, ambiguous unknown. Append-only content-free audit includes actual human auth_method=cloudflare_access, action/target/generation/outcome, never proofs/digests/token/request label.

## Code map / contracts

8.1 adds `foundation/src/device-contract.ts`, `foundation/tests/device-contract.test.ts`, required unit discovery and CI list. Exports immutable limits/actions; strict discriminated command parser; canonical256-bit secret/challenge validation; SHA256 challenge derivation. Reuse actual scope/operation-key conventions; no dependency install.8.2 will add a NEW013 migration, service/routes and restricted PostgreSQL/HTTP tests; never edit001–012. Existing authentication/current-authority services remain core boundary.8.3 owns actual durable platform stores/client reconnect, not this contract.

Commands: begin{label,challenge,actions,operationKey}; approve{enrollmentId,expectedRevision,actions}; complete{enrollmentId,verifier,token}; status{enrollmentId}; rotate{deviceId,expectedGeneration,token,operationKey}; revoke{deviceId,operationKey}; list{}. Unknown keys, malformed UUID/secret, duplicates/privileged actions, invalid finite positive versions and unbounded labels/keys fail before storage. Begin labels1–80 UTF-8 bytes, no controls; keys1–128 ASCII[A-Za-z0-9._:-]. Caller cannot set owner/scope/expiry/role/reviewer/auth method. Completion token must differ from verifier.

## Tasks and acceptance

- [x] Given supported commands, return frozen typed snapshots with exact fields and bounded values; no caller mutation of stored command arrays.
- [x] Given authority injection, privileged/duplicate/empty actions, malformed proof/token/IDs/versions/keys/labels, deny without returning secrets in errors.
- [x] Given canonical256-bit verifier, derive matching SHA256 base64url challenge; reject noncanonical aliases/wrong length.
- [x] Directly reconcile owner/admin/device identity distinctions, current-role reduction/revocation, expiry/zero grace/replay and atomic audit/OS-store responsibilities; no unanswered critical8.2 contract choice.
- [x] Required nonzero unit tests, typecheck/lint and existing full regressions pass; mark only8.1 locally accepted. No device runtime or platform/deployment claim from contract tests.

## Local acceptance evidence

Admission14: actual build renderer/steps01/03, Brooks/Woz loaded, direct self-check of staged `admission14-contract-candidate.diff`; no independent reviewer. `bun test tests/device-contract.test.ts` red exit1 before implementation. First `bun run check:all` reached four green contract tests then failed test-only TypeScript expectation narrowing; explicit unknown-input expectation fixed without changing behavior. `admission14-contract-full2.log` records `bun run check:all` exit0 at2026-10-27T13:00:03-04:00:157tests/1308assertions, unit42/376 and restricted PostgreSQL115/932, typecheck/lint passed, no missing/skipped tests. New contract suite4/108 exercises all seven commands and negative matrix.8.1 is locally accepted;8.2 actual issuance/revocation/rotation/storage/HTTP and8.3 actual platform store remain unimplemented. No deployment/real-device/platform claim. Next8.2 starts with current-owner attenuation regression against real restricted PostgreSQL.
