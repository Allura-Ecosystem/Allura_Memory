---
title: Story10.1 pinned Bumblebee evidence and capability contract
type: feature
created: 2026-10-27
status: done
route: dispatch
baseline_commit: 714e24303de3785ff8fa327b95397fe9b6b6acbb
context: []
---
<frozen-after-approval>
## Intent

Bind the approved upstream read-only scanner to a fail-closed local integration contract before implementing10.2 transport/storage. Ordinary local design choices are delegated; this specification does not enroll a production source or authorize any upstream replacement.

## Boundaries & Constraints

Always preserve REQ-BMB-001–016, REQ-MOD-001–006, AD-57/60, FR-F4 and independent human semantic approval. Use v0.1.2/cc57710eeaf685e7b89924a36c8583cad0a378fe/schema0.1.0/Apache-2.0. Authenticate current server source/scope separately from parsing. Exact source population and approved catalog revisions bind each server-issued monotonic lease. Never execute packages, expand capability on installation, adopt unknown feeds, store unqualified wire data or claim10.2 receiver behavior from pure-contract tests. No release acceptance is closed here.

## I/O & Edge-Case Matrix

| Scenario | Input | Expected behavior |
|---|---|---|
| Source request | Valid opaque source/endpoint IDs, population roots digests, supported profile/ecosystems, optional exact catalog | Immutable normalized bounded copy and deterministic population digest |
| Authority injection | Extra scope/role/credential/actions/command fields, unknown modes, sparse/duplicate/oversized arrays | Generic invalid error, no secret echo |
| Exclusive routes | Runner versus ingest, wrong HTTP method/path, browser/MCP credentials | Only exact runner→lease and ingest→ingest routing; routing alone never authenticates |
| Population completion | Complete matching counts/roots/profile, no suppression/diagnostics/timeout and newer generation | Eligible routine update, including zero records; otherwise evidence-only |
| Module descriptor | Known module/version/core, declared allowed read capabilities | Frozen descriptor; unknown/duplicate/code-loading/incompatible/escalating modules rejected |
| Upstream pin | Approved tag/source/license and examined code/schema | Exact artifact hashes/provenance; enum drift restricted; no downloaded code run before inspection |
</frozen-after-approval>

## Code Map

- `foundation/src/authority.ts`: current human/workspace action checks; no new live grants or role fallback.
- `foundation/src/device-contract.ts`: bounded exact-key parsing/immutable-copy pattern; keep device audience separate.
- `foundation/scripts/test.ts`: mandatory case/assertion discovery; add new contract tests.
- New `foundation/src/bumblebee-contract.ts`: source/population/lease routing/module boundary primitives only.
- New `foundation/tests/bumblebee-contract.test.ts`: negative and canonicalization tests; no fake database or receiver acceptance.
- New `foundation/upstream/bumblebee-v0.1.2.json`: exact official pin/artifact/license/schema provenance, no upstream source vendoring.
- New `../planning-artifacts/contracts/bumblebee-v1.md`: service/storage handoff specifying all required authority, replay/redaction/retention boundaries before10.2.

## Tasks & Acceptance

- [x] Inspect official pinned source/license/mode and record exact hashes/schema drift; given tag v0.1.2, resolving its annotated tag must equal the approved commit.
- [x] Implement test-first contract primitives and required discovery; given each matrix input, actual tests must exercise its defined behavior and redacted failure.
- [x] Define concrete10.2 source/catalog/lease/sanitized batch/current-inventory/alert persistence and transaction contract with scope-qualified keys and no authority expansion.
- [x] Direct self-check, all current type/lint/test lanes and local evidence; given passing tests, accept only10.1 contract scope, not receiver/runner/module UI or production.

## Design Notes

Delegated defaults: initial ecosystems npm/pypi, profiles baseline/project with explicit bounded root fingerprints; deep/findings-only and the upstream agent-skill enum drift are rejected rather than quietly widening schemas. No external advisory feeds enabled by default. Approved immutable internal catalog documents carry publication/fetch/publisher/source/trust/freshness/redaction/retention metadata and human approval receipt. SHA256 integrity is not provenance approval. Runtime flags/version build metadata are bound explicitly because the approved source's compiled default says0.1.1.

Source requests carry hashes, not sensitive root paths. The later runner must prove local authorized roots against those hashes before execution; receiver independently compares summary roots and count/population identity. Module descriptors are data-only and read-capability bounded; adding code URLs, policies or credentials fails closed.

## Implementation Notes

Native Brooks/Woz guidance loaded; existing sole worker implements per explicit authority. Actual render/resolver route used; no reviewer delegates. Official source downloaded into private Operations for inspection. Annotated tag resolves the approved commit. Prior blocker already archived by parent; initial archive attempt refused overwrite, bytes preserved. Brain recall unavailable.

## Verification

`bun test tests/bumblebee-contract.test.ts` red then green; `bun run check:all` nonzero current full suite; source/archive hash verification and no protected/vendor changes. Real scanner leased HTTPS acceptance belongs10.2/10.3, not this contract story.

## Local contract acceptance —2026-10-28
Retained code/provenance from413b7a951f5c119bb16fd74d2c5d586f778e586d was directly rechecked against the six matrix rows and contracts/bumblebee-v1.md. Exact normalized source/population, scoped authority/credential separation, catalog approval/digest, immutable lease/replay, append-only redacted transaction, completeness and module boundaries are specified. No server authentication inferred from route classification or gateway DTOs. Official source/license/binary inspection and selftest evidence remain in admission24-upstream; no reproducible-build claim.

Focused rerun `bun test tests/bumblebee-contract.test.ts` exit0:5tests/147assertions, no failures, Operations/direct-build-20261026/admission28-contract-final.log. Current full and exact-source six-lane local CI at2f03d0c5b01f98c4d44c30a8401b40f24267170d passed216/2176 plus617browser/10scenarios (see Epic7 local retro for raw receipt paths). No independent developer review.10.1 accepted as contract scope only after Epic7 local retro;10.2 transport/database/runner and10.3 module lifecycle/UX remain open. Candidate hashes are verified separately, not accepted by this closure.
