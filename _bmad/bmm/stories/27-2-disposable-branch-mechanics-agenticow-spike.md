# Story 27.2 — Disposable Branch Mechanics: AgenticOW Recon and Spike

**Status:** draft/planned
**Owner:** Woz + Knuth + Bellard
**Depends on:** 27.1
**Blocks:** 27.3, 27.4, 27.5

## Outcome

Pin and recon the AgenticOW upstream (revision, license, provenance, native/WASM surface,
install hooks, network/secret requirements, maintenance signals, rollback) with an
`adopt`/`adapt`/`experiment`/`reject` verdict per capability, then prove the disposable
branch mechanics — fork at least two isolated branches from one authorized base, branch-local
writes, tombstones, checkpoint, rollback, and diff — on disposable fixtures with a pinned
revision, recording dataset size, dimensions, hardware, storage, latency percentiles, and
recall.

## User Story

As a governed memory operator, I need disposable, isolated branch mechanics for parallel
experiments so that failed experiments can be rolled back or quarantined without ever
polluting canonical memory — and I need an honest upstream verdict before any mechanism is
adopted.

## Acceptance Criteria

- [x] Upstream recon records exact repository revisions, license, provenance, native/WASM
      surface, install hooks, network/secret requirements, maintenance signals, and rollback
      path; no upstream code executes during recon; verdict is `adopt`/`adapt`/`experiment`/
      `reject` per capability. — Recon complete: spike note at
      `docs/archive/allura/evidence/epic-27/spike-27.2-agenticow-recon.md` (pinned commit
      `dd4f437b9` / agenticow@0.2.4, MIT, no tags, 15 commits, runtime is network-free and
      secret-free, pure-JS exact path + linux-x64-gnu-only native ANN; per-capability
      verdicts: `experiment` for branch/checkpoint/rollback/diff/promote/query, `reject`
      for `nativeAnn`-as-shipped and for whole-package adoption at this stage; checked-in
      acceptance artifact `bench/acceptance-results.json` records `pass: false` @ 30/1000
      branches, contradicting the README's "1000-branch PASS" badge; no upstream code
      executed, no adoption, nothing installed — recon only).
- [ ] Spike uses only disposable fixtures and the pinned dependency/revision (no unbounded
      branch retention, in line with the out-of-scope list).
- [ ] At least two isolated branches are forked from one authorized base, and read-through
      (branch sees the base) is proven.
- [ ] Branch-local writes, tombstones, checkpoint, rollback, and diff are proven on the
      fixtures.
- [ ] Degraded, expired, rejected, quarantined, and rolled-back branch states are explicit
      and observable.
- [ ] Dataset size, dimensions, hardware, storage, latency percentiles, and recall are
      recorded as machine-readable evidence.

## Dependencies

- 27.1 (authorized-base-snapshot contract defines what "authorized base" means before forking).

## Rollback

Disposable fixtures only; nothing adopted into `src/`. Rollback is deleting the fixture
state and un-reconciling the pinned dependency.
