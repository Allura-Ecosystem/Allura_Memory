---
title: Story11.2 disposable experiments and fixed fixture comparison
type: feature
created: 2026-10-28
status: in-progress
route: dispatch
baseline_commit: 77468faea480c6d0d742fd905946fe13e6c07946
context: []
---
<frozen-after-approval>
## Intent
Integrate the verified candidate engine against accepted11.1 contract. Exercise actual process-local branch mechanics and identical-fixture comparison before building11.3 durable governed handoff. No upstream adoption.

## Boundaries & Constraints
Same exact scope/current branded identity, owner-bound finite engine, immutable canonical base, bounded in-flight work/quotas/expiry. No SQL/disk/network/import/approve/merge API in engine, no arbitrary code execution. Server-owned reader and AuthorityStore only; host destroy is not a public action. Source changes quarantine; exports require independent human review, never canonical mutations. Shared registries edited minimally; retained UI/security unchanged. No external approval/deployment/production/real data, helpers, branches/worktrees or policy changes.

## I/O & Edge-Case Matrix
| Scenario | Expected |
|---|---|
| Create/edit/checkpoint/fork/tombstone/rollback | Independent overlays/checkpoints, unchanged frozen base/lineage/evidence, monotonically increasing revisions |
| Replay/stale revision/foreign owner or checkpoint | Fail closed; no partial effect or foreign contents |
| Quarantine through disposed intermediate parent | All descendants purged; no revival |
| Expiry/dispose/operation or branch quota | Purge payloads; retain bounded spent IDs/keys; cleanup possible at normal quota exhaustion |
| Forged candidate/digest/stale source/authority/expiry | Never valid candidate/approval; no canonical mutation |
| Busy/hung adapter/current grant revoked/destroy during await | Deny admission or disclosure, no late branch allocation after teardown |
| Same frozen RAM/Durham fixture, predeclared queries, two algorithms/two runs | Identical bounded diagnostic witness, no general superiority/training/self-reward claim |
</frozen-after-approval>

## Code Map
- Accepted `src/memory-experiment-contract.ts` / authority/authentication: unchanged contract/current capability checks.
- Candidate `src/memory-experiment.ts`, `tests/memory-experiment.test.ts`: read complete313/398 lines; copy exactly after fresh READY verification; source snapshot stays untouched.
- `scripts/test.ts`, `src/ci-contract.ts`: register14 exact cases/min130 assertions, no lost existing suites.
- `contracts/branchable-memory-v1.md`: specified mechanics/limits and11.3 boundary.

## Tasks & Acceptance
- [x] Missing-module red then byte-identical engine import; registered finite mechanics/negative tests pass.
- [x] Direct code self-check and additional concrete defects/tests if found; no independent development review.
- [ ] Full canonical composite check and fail-closed registry proof in disposable copy; source/fixture/witness hashes retained.
- [ ] Exact-source release verification before story acceptance, with clear local-only limits.11.3 remains pending.

## Design Notes
Use accepted11.1 ceilings and replay-denial semantics, not canonical receipt replay. Timer-driven/reference cleanup is not secure erase. Trusted adapter promise cancellation/process-wide admission belongs to11.3 integration before transport exposure; no public route here. Fixture phrases/token overlap are synthetic diagnostic algorithms, not adopted upstream or a general retrieval benchmark. Preserve independent human approval and actual future transactional current-head checks.

## Implementation Notes
11.1 accepted at77468faea480c6d0d742fd905946fe13e6c07946. Parent candidate is inactive and baseline verified; no active worker source overwritten. This is integration, not reviewer signoff. No new dependency/migration.

Admission39 integration: complete313-line engine and398-line candidate tests read; source SHA256222d260c02d8cdfb3822944211e12a21e4fa1636426973e8bd6f80afa2bc6ee3 and test SHA256dbccf090831317b459e00d864955cdbc5eff15df53914a52d6702c311fdc77e3 copied byte-identically after READY checks. Native red missing module exit1 then focused14tests/130assertions exit0. Canonical registered full `admission39-engine-full.log` exit0 at15:02:52-04:00:278tests/3197assertions,0fail/skip,731browser assertions/12scenarios; typecheck/lint passed. Raw logs in direct-build Operations. Deterministic witness baseDigest0fc6bca0e05a09651473044eda6e0df98152e3a2b97626d3e4c4204aecae9f8b, fixed3query diagnostic phrase1/tokenOverlap3, repeat identical. No general retrieval superiority or learning claim. Exact-source/registry-negative verification NOT run before native wrap-up; story remains in-progress and uncommitted. No11.3 integration or acceptance inferred.

## Verification
`bun test tests/memory-experiment.test.ts` red/green; `bun run check:all` actual canonical registered unit/model/restricted DB/browser/type/lint. Disposable registry-negative test must exit nonzero when a required case is absent. Fresh exact git-source six-lane CI/package verification before acceptance; future11.3 must separately prove governed proposal/durable/browser behavior.
