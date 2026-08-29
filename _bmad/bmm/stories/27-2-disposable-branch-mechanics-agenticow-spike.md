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
- [x] Spike uses only disposable fixtures and the pinned dependency/revision (no unbounded
      branch retention, in line with the out-of-scope list). — Fixture proof §AC-2:
      `agenticow@0.2.4` + `@ruvector/rvf-node@0.2.3` exact pins installed in
      `/tmp/agenticow-recon/fixture-env` only (byte-identical to pinned clone `dd4f437b9`);
      fixtures under `/tmp/agenticow-recon/fixtures`, removed after the run; no in-repo
      installs.
- [x] At least two isolated branches are forked from one authorized base, and read-through
      (branch sees the base) is proven. — Fixture proof §AC-3: `b1` and `b2` forked from one
      5,000-vector base; base id 5 is top-1 through both branches; `lineage()`
      `[working, base]`; empty fork child exactly 162 B.
- [x] Branch-local writes, tombstones, checkpoint, rollback, and diff are proven on the
      fixtures. — Fixture proof §AC-4: adds invisible across branches, override id 42
      child-wins, tombstone 7 masked branch-locally, checkpoint('clean'), rollback reverted
      6 poison edits + removed poison file from disk, `diff()` all three shapes on both
      branches; quarantine/reject analog with zero blast radius; CLI verbs corroborate.
- [x] Degraded, expired, rejected, quarantined, and rolled-back branch states are explicit
      and observable. — Fixture proof §AC-5: agenticow has **no status model**; mechanical
      equivalents proven (rollback→rolled_back, checkpoint-after-poison→quarantine,
      close+rm→reject, nativeAnn try/catch→degraded, none→expired) with STATE recorded as
      app-level (27.1 `branch_registry` / 27.6 gate) per recon §2 invariant-8 seam; on this
      linux-x64 host `fork({nativeAnn:true})` engaged natively (degraded path source-verified
      only).
- [x] Dataset size, dimensions, hardware, storage, latency percentiles, and recall are
      recorded as machine-readable evidence. — `spike-27.2-fixture-metrics.json`: 5,000×d128
      cosine; Ryzen 7 5800XT/16 thr/30.3 GB/linux-x64/Node v24.19.0; fork p50 4.50 ms,
      query base 0.31 / branch read-through 0.40 ms, checkpoint 4.45, rollback 4.63, diff
      0.24 ms; storage 162 B empty fork; recall@10 100.0% (brute-force ground truth, 30
      queries). Marketing 0.5 ms fork/rollback NOT reproduced (10×) — COW crossover and
      older hardware, per bench/results.json.

## Dependencies

- 27.1 (authorized-base-snapshot contract defines what "authorized base" means before forking).

## Rollback

Disposable fixtures only; nothing adopted into `src/`. Rollback is deleting the fixture
state and un-reconciling the pinned dependency.
