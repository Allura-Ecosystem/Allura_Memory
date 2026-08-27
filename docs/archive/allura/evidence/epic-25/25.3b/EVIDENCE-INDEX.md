# Story 25.3b local-remediation evidence index

**Candidate status:** local remediation verified; **not accepted**. This index deliberately does not mark Story 25.3b, `REQ-MOD-001..003`, or Story 26.7 AC-2 complete. Independent review is still required.

## Candidate identity

The remediation candidate is the **complete Git tree** of the remediation commit, not a selected-file hash. That commit carries a `Candidate-Tree:` trailer containing the exact value emitted by the reproducible clean-tree check below. It therefore binds the production implementation, all focused/live tests, contracts, story/status records, and this evidence together without recursively hashing a subset.

```bash
# From the clean worktree at the remediation commit:
git status --porcelain=v1          # must print nothing
git rev-parse HEAD^{tree}          # must equal the commit's Candidate-Tree trailer
git log -1 --format=%B | grep '^Candidate-Tree: '
```

The commit tree is Git's canonical ordered snapshot of every tracked path, so the tree ID changes if any production implementation, test, contract, story/status, or evidence file changes. Independent review must freeze and review a new tree ID after every remediation.

## Required evidence map

| Required item | Real artifact / executable evidence | Status and scope |
| --- | --- | --- |
| Readiness | `_bmad/bmm/stories/25-3b-modular-dashboard-workflow-contract-registry.md` §Prerequisite-Verification Record; `_bmad/bmm/stories/sprint-status.yaml` `epic_25.stories[25.3b]` | Local readiness record; it permits remediation work only, not acceptance. |
| Architecture | `_bmad/bmm/stories/25-3b-modular-dashboard-workflow-contract-registry.md` §Outcome and §Explicit Non-Goals; `docs/allura/REQUIREMENTS-MATRIX.md` `REQ-MOD-001..003` | Canonical bounded authority/requirement references. Requirements remain dependency-blocked. |
| Contract snapshot | `src/lib/curator/module-contract.ts`; `src/lib/curator/module-registry.ts`; focused `src/lib/curator/module-registry.test.ts` | Source-controlled contract and its focused checks, bound to the candidate tree above. No claim is made that the event metadata is relational evidence or replay-safe. |
| Adversarial authority and isolation | `src/lib/curator/module-registry.test.ts`; `src/lib/curator/module-registry.audit-failure.test.ts`; `src/__tests__/curator-module-registry.live-db.test.ts`; `src/__tests__/bumblebee-tenant-isolation.e2e.test.ts` | The focused suite covers forged identity, malformed manifests, missing capabilities, disabled/read-failure outcomes, and forced audit-transaction failure for manifest-invalid, denied, disabled, and read-failure outcomes. Those audit failures return an explicit unavailable error rather than the ordinary outcome. The fresh live lane covers managed-app-role issuance, denial/disable outcomes, event immutability, and the configured tenant-isolation inventory. |
| Accessibility | `src/__tests__/curator-module-shell.test.tsx` | Focused shell-state/accessibility test is included in the 35-test focused command recorded below. This is test evidence, not a browser/manual accessibility acceptance. |
| Rollback | `src/lib/bumblebee/module.ts`; `src/lib/bumblebee/__tests__/module.test.ts`; `src/lib/curator/module-registry.test.ts` | Feature-flag disablement returns `unavailable` without restoring a direct route. The focused registry suite covers the disabled outcome; unit suite covers the broader module rollback checks. |
| Fresh live CI app-role lane | `remediation-verification-2026-08-27.md` §Fresh live PostgreSQL CI app-role lane; ignored local report `artifacts/ci/local/25-3b-remediation-final/live-db-tests.json` | Passed locally on a newly created disposable PostgreSQL 16 container: 49 migrations; 24/24 suites and 72/72 tests. The lane no longer mutates the shared `allura_app` grant. |
| Independent review | No approval artifact exists for this candidate. | **Pending.** This is a required gate; its absence keeps the story in progress and `REQ-MOD-001..003` / Story 26.7 AC-2 blocked. |

## Scope and truthfulness constraints

- The live registry test does **not** execute `REVOKE` or `GRANT` against `allura_app`. A prior grant-mutation probe was unsafe because the live Vitest lane uses parallel forks against one database. The read-failure outcome remains covered by the focused unit test, where the host-owned summary reader is explicitly rejected.
- The live command validates a newly initialized disposable database. It is not deployment proof and does not represent an independent review or acceptance.
- No registry scope, route, or Story 26.7 registration was added by this remediation.
