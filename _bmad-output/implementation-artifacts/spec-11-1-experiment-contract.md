---
title: Story11.1 bounded same-scope memory experiment contract
type: feature
created: 2026-10-28
status: done
route: dispatch
baseline_commit: d0156ec53267a76225618f5174baf76d74428c2c
context: []
---
<frozen-after-approval>
## Intent
Specify exact authorized snapshots and disposable state boundaries before enabling branch mechanics. Integrate the byte-verified candidate contract with canonical tests and concrete11.2/11.3 handoff. This is a bounded experiment, not a new memory authority or upstream adoption.

## Boundaries & Constraints
Preserve exact authenticated scope, immutable semantic identity/version/evidence, independent human promotion and current permission checks. Parsed scope and SHA256 are integrity data, never authorization. PostgreSQL remains canonical. No endpoint, durable branch storage, new grants, upstream execution, deployment, production data or automatic promotion. Candidate design choices are delegated defaults, not historical human mandates. No vendor/protected README/asset changes.

## I/O & Edge-Case Matrix
| Given / when | Then |
|---|---|
| Bounded same-scope snapshot with exact IDs/version/content/evidence | Deep immutable copy, deterministic sorted digest, exact text preserved |
| Foreign scope, unknown authority fields or duplicate memory/knowledge/evidence IDs | Reject without disclosure or normalization |
| Float/leading-zero/overflow version, malformed UUID/text/surrogates, accessor/sparse array | Reject without executing accessors or inventing data |
| Records/content/serialized-byte ceilings exceeded | Bounded rejection; quota is not permission |
| State/identity/retention/export specified | Finite disposable contract, no durable/canonical mutation or approval path |
</frozen-after-approval>

## Code Map
- `foundation/src/authority.ts`: existing validScope/current action resolution; reuse without widening roles.
- Candidate `memory-experiment-contract.ts`: verified new DTO/limits/parser; copy only this file for11.1.
- New `foundation/tests/memory-experiment-contract.test.ts`: canonical focused negative cases before import.
- `foundation/scripts/test.ts`, `foundation/src/ci-contract.ts`: register exact names/assertion floor/suite identity; preserve discovery safeguards.
- New `../planning-artifacts/contracts/branchable-memory-v1.md`: concrete candidate-derived handoff, distinguishing specified obligations from implemented mechanics.

## Tasks & Acceptance
- [x] Specify authority/base identity/state/quotas/retention/threats/proposal-only export; no upstream execution/adoption.
- [x] Test-first strict contract/security negatives; preserve candidate bytes or document bounded fixes.
- [x] Registered unit/full/type/lint and direct diff self-check; close only11.1 contract, not11.2 runtime or11.3 curator acceptance.

## Design Notes
Defaults:8 lifetime branch allocations,128 base records/131072 bytes per base and overlay,12000 content bytes,4 checkpoints,128 operations, explicit positive ttl<=3600000ms; recommended900000ms. Bounded IDs/replay keys survive terminal cleanup until engine teardown. Base selects one immutable version per knowledge identity,1–31 evidence IDs. Branch-local tombstones/rollback cannot delete/restore canonical records. Server-owned snapshot readers require restricted/current-authority checked reads. No raw event bodies/vectors/files. Source revalidation and current canonical head locks are separate. Export at most16 changes/31 evidence IDs as requires_curator_review candidate, never a Proposal/receipt. Machine capture/proposal ceilings remain; human reviewer cannot inherit engine ownership from role. Ordinary local design is delegated; consequential production/adoption decisions excluded.

## Implementation Notes
Native Brooks/Woz/build route used; preflight passed. Candidate11 inactive;13 READY file hashes,6 log hashes and1265 baseline files verified unchanged. No independent reviewer/helper. No new dependency.

## Verification
Focused red→green, registered unit/typecheck/lint and full `bun run check:all`; nonzero required names/no skips. Preserve scanner/graph/review regression.11.2 runtime/11.3 transactional integration require separate evidence.

Accepted LOCAL contract only: candidate source SHA256c8c9cb12410ba0e361d879c7bd077a8c24276b23d7a985f81e7651ff14230361 copied byte-identically. New registered contract suite3tests/33assertions, malformed/foreign/accessor/sparse/duplicate/version/content/aggregate-byte ceilings exercised. Admission39 missing-module red exit1; initial and expanded complete checks exited0. Final `admission39-contract-final-full.log`:264tests/3067assertions,0fail/skip, plus731browser assertions/12scenarios, typecheck/lint passed14:55:58-04:00. Operations logs at `/home/ronin704/Documents/Sabir Asheed/Allura Memory/Operations/direct-build-20261026/`. Direct self-check of all authored contract/spec/test and minimal two registration changes; no authority widening/dependency/canonical write/route introduced. No engine, actual proposal integration, production or whole-epic acceptance claimed.
