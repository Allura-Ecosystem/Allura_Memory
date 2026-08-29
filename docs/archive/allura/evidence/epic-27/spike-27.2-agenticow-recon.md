# Spike 27.2 — AgenticOW Upstream Recon (AC-1)

> ⚠️ **SPIKE — DESIGN/RECON ONLY. NOT ADOPTION. NOT IMPLEMENTATION.**
> This note pins and recons the `ruvnet/agenticow` upstream (revision, license, provenance,
> surface, install hooks, network/secret requirements, maintenance, rollback) for Story
> 27.2 AC-1. **No upstream code was executed during this recon** — no `npm install`, no
> `node`, no CLI runs; only read-only inspection of the cloned tree and read-only registry
> queries (`git`, `curl`, `npm view`). The benchmark artifacts cited below are **committed by
> the upstream author** (dated 2026-06-28), read here as evidence — they were not reproduced
> on this machine. Secondary source (gunbark.dev ADR) was unreachable (auth-walled
> fediverse); primary source verification below stands on its own.
> Recon ran at repo HEAD `2428f394` (branch `develop`). This note changes nothing in
> `src/`, adds no package, and is the bounded experiment-first first step of Story 27.2.

## 1. Spike scope and non-goals

**In scope (AC-1):** exact pinned revision (git commit + npm version + transitive pin),
license, provenance, native/WASM surface, install hooks / package manager, network/secret
requirements, maintenance signals (last commit, open issues, activity), rollback path; an
`adopt`/`adapt`/`experiment`/`reject` verdict **per capability**, with honest
marketing-vs-primary-source discrepancies recorded.

**Non-goals (explicit):** no adoption, no installs into the repo, no `package.json`
changes, no CLI execution beyond what is *not* done here (none), no fixture proof. AC-2
(disposable fixtures) through AC-6 (machine-readable metrics) are the **next slice**
(disposable-fixture proof), not this recon. Rollback of this spike = delete `/tmp` clone;
nothing in-repo to un-reconcile (nothing adopted).

## 2. Seam mapping to Epic 27 planning invariants (recon-level)

| Epic 27 planning invariant / Story Map item | AgenticOW surface this recon pins | Gap / seam note |
|---|---|---|
| Invariant 1 — branch identity (`task_id`, `agent_id` components) | Branch labels are free-form strings (`fork(label)`, `branch(label)`); lineage chain parent/label/timestamp | Identity/status lives in app registry (`branch_registry` per spike-27.1 §4); agenticow supplies mechanics, not governance identity |
| Invariant 2 — inherits only from an authorized base | `fork()`/`branch()` derive a child **RVF file** from a parent file in-process; no auth concept | Authorization seam is 27.1's fork gate (tenant/workspace/base-snapshot), enforced before agenticow is ever called; agenticow never sees principals |
| Invariant 6 — read-through (branch sees base) | Exact read-through = `parent ∪ edits`, child wins on id collision, tombstones honored (`query()`, `_chain()` merge) | Mechanically present and in-tree exercised by author tests (8/8 claimed); correctness to be re-proven on disposable fixtures in AC-3/AC-4 |
| Invariant 8 — statuses `degraded\|expired\|rejected\|quarantined\|rolled_back\|active` | Agenticow has **no status model**. `rollback()` exists; `nativeAnn` degrades (boolean `false` → exact fallback); nothing expires; no quarantine/reject concept | Statuses must stay in the app registry (27.1 `branch_registry`/`lock_mode`, 27.6 gate). Agenticow = disposable mechanics; governance = Allura |
| Story 27.3 — promotion adapter | `diff()` (`added/overridden/deleted`) + `promote(target)` (replays edits + tombstones into target) | 27.3's adapter must add the external deterministic gate the README itself mandates (no LM-judge); `promote` is a mechanism, not a gate |
| Out-of-scope — unbounded branch retention | Branches persist as child `.rvf` files until `close()`/disk rm; **no TTL** | Retention enforcement is app-level (27.1 `retention_expires_at`); AC-2's disposable-fixture discipline is the guard |

## 3. Revision pin (primary source)

| Field | Value | Source |
|---|---|---|
| Git commit (HEAD `main`) | `dd4f437b92d2dbbc1f40dfa00023eed6e9c3bd84` (`fix: persist per-node text payloads across save/load (0.2.4) (#3)`, 2026-07-03 22:08:52 -0400) | `git rev-parse HEAD` of shallow clone, then full history |
| Git tags | **none** (no annotated or lightweight tags) | `git tag -l` |
| npm package / version | `agenticow@0.2.4` (`latest` dist-tag) | `npm view agenticow` |
| Published | 2026-07-04T02:09:02Z | `npm view agenticow time` |
| Transitive dependency | `@ruvector/rvf-node@^0.2.0`; latest at recon 0.2.3 (2026-07-28) — native binding | `package.json` + `npm view` |
| Node engine | `>= 18`, ESM (`"type": "module"`) | `package.json` |
| Clone receipt | shallow then `--unshallow` clone of `https://github.com/ruvnet/agenticow.git` into `/tmp/agenticow-recon/repo` | terminal output |

15 commits total (2026-06-28 13:49 → 2026-07-03 22:08). The pin for any future fixture
slice is **commit `dd4f437` + `agenticow@0.2.4` + `@ruvector/rvf-node` pinned exactly
(e.g. `0.2.3`)** — never the `^0.2.0` range, since the native binding is the surface that
changes behavior across platforms.

## 4. License and provenance

- **License: MIT** — `LICENSE` file present at repo root: "MIT License … Copyright (c) 2026
  ruvnet … THE SOFTWARE IS PROVIDED 'AS IS'…". GitHub API confirms `spdx_id: MIT`. npm
  metadata: `license = 'MIT'`. Permissive → vendoring/pinning is legally clean (attribution
  required). ⚠️ Caveats: `MIT © ruvnet` covers the JS wrapper; the native engine is
  RuVector RVF in `@ruvector/rvf-node` (also MIT per npm metadata) — both heads verified.
- **Provenance:** single-maintainer project by `rUv (ruv@ruv.net)` (github.com/ruvnet), a
  known prolific open-source author (RuVector, agent-harness-generator, @metaharness org).
  Repo created 2026-06-28, pushed 2026-07-04, **single-owner — bus factor 1**, no CODEOWNERS
  observed, no release automation beyond npm publish. Built on upstream RuVector RVF COW
  engine (PR #617/#618 wires native ANN-across-branch). Marketing site
  `ruvnet.github.io/agenticow` (docs/ in-tree, GitHub Pages workflow).

## 5. Surface: native / WASM / JS

- **Core = pure JS (ESM), not Rust, not WASM.** `src/index.js` (≈28 KB) + `src/index.d.ts`
  (types). All COW branching, read-through merge, tombstones, diff, promote, checkpoint,
  rollback implemented in JS over the RVF file format. Runs on Node ≥ 18, any platform.
- **Native = optional, via NAPI binding** `@ruvector/rvf-node` (Rust), shipped as prebuilt
  **optionalDependencies** (no compile, no install scripts — `scripts` has only
  `build: napi build` for source builds; no `postinstall`): darwin-x64/arm64,
  linux-x64-gnu, linux-arm64-gnu, win32-x64-msvc.
- **No WASM surface.**
- **`nativeAnn` (native ANN across the COW boundary):** `fork(label, file, { nativeAnn: true })`
  requires `RvfDatabase.branch()` which **ships only for linux-x64-gnu today**; elsewhere the
  code catches and falls back to exact JS read-through, `mem.nativeAnn === false`. Author's
  own committed `claim-ladder-results.json` shows `nativeAnnActive: true` on their
  linux-x64 AMD Ryzen 9 9950X (forkNative 0.544 ms, base 5000, dim 64, N 200).
- **CLI** `bin/agenticow.js` (verb table verified in source): `init`, `ingest`, `branch`,
  `checkpoint`, `rollback`, `diff`, `promote`, `query`, `lineage`, `demo`, `bench`,
  `acceptance`; `bench`/`acceptance` spawn **local** node subprocesses
  (`spawnSync(process.execPath, …)`) — no remote execution.
- **API surface** (from `src/index.js`): `open()`, `AgenticMemory` — `ingest`, `query`,
  `delete` (tombstone), `branch` (auto-isolating), `fork` (fan-out, non-re-pointing),
  `checkpoint`, `rollback`, `diff`, `promote`, `lineage`, `status`, `save`/`load`
  (manifest v2 adds per-node `texts`), `close`. Types shipped.

## 6. Install hooks / package manager / network / secrets

- **Package manager:** npm only (`npm install agenticow`). No yarn/pnpm-specific fields, no
  cargo/wasm toolchain required for consumers.
- **Install hooks:** none that execute during install (no `postinstall`/`preinstall` in
  agenticow or the rvf-node platform packages checked via `npm view scripts`). Native
  bindings ride on optionalDependencies (npm installs the right prebuilt).
- **Network requirements:** install-time downloads from npm only. **Runtime: zero network.**
  No `fetch`, no HTTP clients, no WebSocket in `src/index.js` or `bin/agenticow.js`
  (verified by grep). Everything operates on local `.rvf` files in-process.
- **Secrets:** none. No API keys, no telemetry, no analytics endpoints, no phone-home.
  The meta-harness ecosystem (`@metaharness/jujutsu`) is an **optional peer** for other
  projects; not required by agenticow itself.
- **Blast radius at runtime:** local file I/O on `.rvf` files under the working directory
  (`fs.mkdtempSync` in bench, `tmpChildPath` for derived nodes, `fs.rmSync` on rollback).

## 7. Maintenance signals (primary source, as of 2026-08-29)

| Signal | Value |
|---|---|
| Repo created | 2026-06-28 |
| Total commits | 15 (all 2026-06-28 → 2026-07-03) |
| Last push (`pushed_at`) | 2026-07-04T02:08:52Z |
| Latest release published | agenticow 0.2.4 on 2026-07-04 |
| **Silence since** | **≈8 weeks** at recon date (no commits/release after 07-04) |
| Open issues | 2 (docs/types GEPA case-study #2, explainer request #1) — no reported defects |
| Stars / forks | 51 / 8 (small but real usage) |
| Archived / disabled | no / no |
| Transitive health | `@ruvector/rvf-node` **more active**: 0.2.1–0.2.3 released 2026-07-28 (5 fixes after agenticow's last release) — the native engine moves; the wrapper is dormant |
| Tests in-tree | 2 test files (memory, text-persistence); README badge claims 8/8 passing — not independently run here |

**Honest read:** young (7 weeks at recon), single-maintainer, dormant for 8 weeks while its
own underlying engine shipped fixes. Fine for an **experiment** with a pinned commit;
insufficient signal for an **adopt** verdict. Re-evaluate maintenance at 27.6 gate time.

## 8. Rollback path

- **This spike:** no adoption ⇒ rollback is deleting `/tmp/agenticow-recon`. Nothing in
  `Allura_Memory` references it.
- **Future fixture slice (AC-2+):** fixtures are disposable by design (mkdir-temp, rm on
  close — the library's own bench does this). `git clean` + removing any pinned entry from
  package manifests fully un-reconciles (Story 27.2 Rollback section already says: "Rollback
  is deleting the fixture state and un-reconciling the pinned dependency").
- **Long-term:** MIT permits vendoring the pinned commit as a fallback against upstream
  disappearance; never needed for this spike.

## 9. Marketing claims vs primary-source evidence (honest discrepancy table)

| Marketing claim (README/package.json/npm blurb) | Primary-source evidence in-tree | Verdict |
|---|---|---|
| "Branch a base vector memory in ~0.5 ms / 162 bytes … **independent of base size**" | `bench/results.json` (author-run): branchCreate 0.463–0.519 ms flat — but at **n=10,000 the full copy is FASTER** (`speedup: 0.718`, fullCopy 0.373 ms). Win only appears ≥ ~100k (**67 ms full copy @ 1M vs 0.472 ms branch = 142×**). 162 B empty-branch size confirmed in results | **NOT reproduced as "independent of base size."** Flat branch cost is real; the *win vs full-copy* has a crossover (~tens of thousands of vectors). README's own table prints "1×" at 10k while results.json records 0.719 — the sub-1× run is rounded away |
| "83× faster / 3000× smaller snapshots" headline | Those are the **RuVector RVF proof's** conservative numbers, not this repo's measurement (README says so). This repo's bench shows 0.7×–142× speedup and 32k×–3.2M× size-ratio depending on N | Headline omits the crossover; honest per-N numbers exist in `bench/results.json` |
| "1000-branch proof … **PASS ✓** … recall@10 = 100%" | **Committed `bench/acceptance-results.json` records `branchesForked: 30` (of target 1000) and `"pass": false`** (base 3000, dim 128, 2026-06-28). recall@10 and exactOrderMatch = 1.0, maskViolations 0, rollback p50 0.537 ms | **Flagrant badge gap:** README claims a 1000-branch PASS; the only checked-in artifact is a 30-branch PARTIAL run marked `pass: false` (exit 1). The 1000-branch claim is **unverified from primary source** (no matching artifact) |
| "native ANN across the branch … recall@10 ≈ 1.0" | `claim-ladder-results.json`: `nativeAnnActive: true`, forkNative 0.544 ms on linux-x64 (base 5000, dim 64). README concedes **linux-x64-gnu only**, all other platforms degrade to exact | **Platform-constrained claim.** True on author's linux-x64; unverified on any other platform for this project's hardware; recall assertion not independently reproduced |
| "rollback ~0.5 ms" | acceptance-results rollback p50 = 0.537 ms (min 0.48 / max 1.02) on author hardware | Plausible on author hardware; fixture proof (AC-4) must re-measure |
| "Current: agenticow@0.2.1" (README Install section) | package.json/npm latest = 0.2.4, and 0.2.3's changelog exists ("ship process-wide auto-id fix… promote() base-row overwrite") | README stale vs its own HEAD; docs drift |
| Promote semantics | `promote(target)` replays edits + tombstones blindly (child wins; no conflict resolution); 0.2.3 fixed a base-row overwrite bug in promote | Mechanism only — 27.3 must add the external deterministic gate; blind-overwrite semantics acceptable for fixtures, dangerous for canon without a gate |

**Secondary source note:** the task brief referenced third-party ADRs on gunbark.dev.
gunbark.dev is a GoToSocial (fediverse) instance; every API surface I probed (search,
timeline, account lookup) returns `Unauthorized: token not supplied`, and the exact ADR
URLs returned 404 without auth. The secondary numbers ("fixed ~20 ms fork, wins past
~21k-vector crossover") could **not be independently verified** from this environment.
Their *direction* (COW wins only past a vector-count crossover) is **consistent with the
in-repo primary evidence** (0.72× at 10k), which is what this note relies on; treat the
exact gunbark magnitudes as unverified secondary hearsay.

## 10. Verdict table — per capability (honest)

| Capability | Verdict | Rationale (primary-source based) |
|---|---|---|
| `branch` / `fork` (COW branch create) | **Experiment** | Mechanics real (in-tree impl, author bench: flat 0.46–0.52 ms, 162 B empty). **Marketing perf ceiling unverified** — at small bases full copy wins; 8-week-dormant single-maintainer. Prove on fixtures (AC-3) with dataset sizes spanning the crossover before any consideration |
| `checkpoint` | **Experiment** | Simple freeze → derived child node (verified in source, `checkpoint(label)` returns id/label/path/depth). No TTL/expiry — statuses stay app-level. Fixture-proof in AC-4 |
| `rollback` | **Experiment** | Verified path: closes owned nodes, `fs.rmSync`s poison, derives fresh child (author p50 0.537 ms on 9950X — re-measure on fixture hardware). Only rolls back to checkpoints the instance owns (never a shared ancestor) — safe-by-design detail |
| `diff` | **Experiment** | Git-style `{added, overridden, deleted}` over edit tracking (requires `track !== false`). Exact semantics; needs fixture proof + tombstone-mask verification in AC-4 |
| `promote` (merge into target) | **Experiment — with caveat** | Replays edits + tombstones; **no conflict resolution** (child wins blindly; 0.2.3 fixed a base-row overwrite bug). 27.3's promotion adapter must insert the external deterministic gate (README itself mandates no LM-judge). Safe only on disposable fixtures until then |
| `query` / read-through | **Experiment** | Exact path (`parent ∪ edits`, child wins, tombstones masked, JS merge) is the *correctness* core and is what fixtures should assert against brute-force ground truth (the author's own acceptance method). Raw ANN throughput conceded ~6.3× behind hnswlib @ 1M — fine for governed small stores, wrong tool for big canonical indexes |
| `nativeAnn` (Rust dual-graph ANN across branch) | **Reject (for now)** | linux-x64-gnu **only**; no measurement on this project's hardware/CI; grace-degrades to exact anyway. Adds a native binary to the supply chain for a capability the exact path already provides correctly. Revisit only if ANN-across-branch becomes a hard requirement AND CI runs linux-x64-gnu |
| Package as a dependency (whole) | **Reject** (at this stage) | Dormant 8 weeks, bus factor 1, badge artifact contradicts README. Nothing here is needed by `src/` today; recon → fixture slice only |
| CLI verbs | **Experiment** | Verbs align exactly with the mechanics AC-3/AC-4 need (`branch/checkpoint/rollback/diff/promote/query`); local-only, no network. Useful for fixture scripting without writing JS |

**Overall stance:** **recon-clear for experiment; not adopt-ready.** The capability set
maps cleanly onto Epic 27's needs (read-through, rollback, diff, promote-to-gate), the
code is readable JS with honest concessions in its own README, and nothing executes at
runtime beyond local files. But the marketing-vs-artifact gaps in §9 (esp. the `pass:
false` acceptance artifact vs the "1000-branch PASS" badge), the platform constraint on
`nativeAnn`, and the 8-week dormancy demand the disposable-fixture proof slice (AC-2…AC-6)
with **measured**, not marketed, numbers before any adoption discussion at the 27.6 gate.

## 11. Fail-closed enumeration (recon-level targets for AC-2…AC-6 fixtures)

| Case (from AC-5 states + planning invariant 8) | AgenticOW mechanism | Where the guard lives |
|---|---|---|
| Native ANN unavailable / wrong platform | `nativeAnn === false`, exact fallback (catch-and-degrade in `fork()`) | Library-internal + app records `status=degraded` |
| Branch retention expiry | **None in library** — branch chain lives until `close()`/rm | App registry (`retention_expires_at`, out-of-scope unbounded retention) |
| Rejected branch | No native reject concept — "reject" = do-not-promote + rm child | 27.3 promotion gate / app registry `status=rejected` |
| Quarantined branch | No native concept — same as rejected at the library level | App registry `status=quarantined`; 27.6 gate |
| Roll back a poisoned branch | `rollback(checkpointId)` closes+rm only **owned** nodes; abandons poison child | Library-native, fixture-verified in AC-4 |
| Fork with no authorized base | Agenticow cannot be invoked with an unauthorized base — the **27.1 fork gate runs first** | 27.1 seam stack (tenant → workspace → base-snapshot); never reachable from agenticow |
| Read-through correctness | Exact merge asserted vs brute-force ground truth (author method) | Fixture test per AC-3/AC-4 |

## 12. Verification receipts

- `/tmp/agenticow-recon/repo/.git` — clone; `git rev-parse HEAD` ⇒
  `dd4f437b92d2dbbc1f40dfa00023eed6e9c3bd84`; `git log --oneline` ⇒ 15 commits;
  `git tag -l` ⇒ none.
- `/tmp/agenticow-recon/repo/LICENSE` — MIT, Copyright (c) 2026 ruvnet.
- `/tmp/agenticow-recon/repo/package.json` — agenticow 0.2.4, ESM, `@ruvector/rvf-node ^0.2.0`,
  bin/agenticow.js, engines node ≥ 18.
- `/tmp/agenticow-recon/repo/README.md` — marketing claims §9 columns 1; honest concessions
  (ANN ~6.3× gap; linux-x64-gnu-only native; L2-over-normalized cosine note; stale 0.2.1
  version string).
- `/tmp/agenticow-recon/repo/bench/results.json` — crossover evidence (`speedup: 0.718` @
  10k; 142× @ 1M), 162 B empty branch, flat branch cost.
- `/tmp/agenticow-recon/repo/bench/acceptance-results.json` — `branchesForked: 30`,
  `"pass": false`, recall@10 1.0, rollback p50 0.537 ms.
- `/tmp/agenticow-recon/repo/bench/claim-ladder-results.json` — `nativeAnnActive: true`,
  forkExact 0.464 ms / forkNative 0.544 ms, promote 0.897 ms.
- `/tmp/agenticow-recon/repo/src/index.js` — verb surface, `fork()` nativeAnn gating +
  exact fallback, `rollback()` owned-node discipline, `status()/lineage()/save()/load()`.
- `/tmp/agenticow-recon/repo/bin/agenticow.js` — CLI verbs; `spawnSync` only for local
  bench; no network calls (grep: no fetch/HTTP/WebSocket).
- GitHub API (repo metadata) — MIT, created 2026-06-28, pushed 2026-07-04, 2 open issues,
  51 stars/8 forks, not archived/disabled.
- `npm view agenticow`, `npm view @ruvector/rvf-node` — 0.2.4 latest; publish times
  (0.2.4 @ 2026-07-04, rvf-node 0.2.3 @ 2026-07-28); no install scripts; platform binding
  set; license MIT.

## 13. What this enables next (boundary of AC-1)

AC-1 closes here. AC-2…AC-6 (disposable fixtures; ≥2 isolated branches from one authorized
base; read-through proof; branch-local writes/tombstones/checkpoint/rollback/diff proof;
explicit degraded/expired/rejected/quarantined/rolled-back observability; machine-readable
dataset/dimension/hardware/storage/latency/recall evidence) are the **next slice** —
fixture proof using the pinned `dd4f437` + `agenticow@0.2.4` + exact rvf-node pin, still
outside `src/`, per the story's Rollback section.

---

## Fixture proof (AC-2..AC-6)

> ✅ **PROVEN on disposable fixtures, 2026-08-29.** All five ACs verified via
> `fixture-proof.mjs` against the pinned revision. **No upstream code outside `/tmp`,
> no in-repo installs, nothing adopted.** Machine-readable evidence:
> [`spike-27.2-fixture-metrics.json`](./spike-27.2-fixture-metrics.json) (same directory).
> Fixtures and the fixture-env were deleted after measurement; the pinned recon clone at
> `/tmp/agenticow-recon/repo` remains as the pin reference.

### AC-2 — Disposable fixtures with the pinned revision ✅

- Installed **`agenticow@0.2.4` + `@ruvector/rvf-node@0.2.3` (exact pins)** in
  `/tmp/agenticow-recon/fixture-env/` only (`npm install`, 3 packages, no install scripts).
  Nothing touched `package.json`/`bun.lock`/`src/` in `Allura_Memory`.
- **Pin provenance:** installed `agenticow@0.2.4` `src/index.js` hashes **byte-identical**
  (sha256 `c9ab6683…`) to the pinned clone `dd4f437b92d2dbbc1f40dfa00023eed6e9c3bd84`.
- Fixture root `/tmp/agenticow-recon/fixtures/` created, used, and **removed after the run**
  (unbounded retention is app-level per §2 out-of-scope — the library has no TTL).

### AC-3 — ≥2 isolated branches from one base + read-through ✅

- One base: **5,000 vectors, dim 128, cosine** (`base.rvf`, 2.60 MB). Forked **two
  branches, `b1` and `b2`** via the pinned `base.fork(label)` API.
- **Read-through proven:** querying the base id-5 vector returns id 5 as top-1 through
  **both** `b1` and `b2` (each sees `parent ∪ edits`); `lineage()` shows
  `[working, base]` — one shared ancestor.
- **Empty-branch storage claim CONFIRMED:** an empty fork child is **exactly 162 B**
  (README and author's own `bench/results.json` both say 162 B — reproduced exactly).

### AC-4 — Branch-local writes, tombstones, checkpoint, rollback, diff ✅

| Mechanism | Fixture proof (b1: adds 8000-8004, override 42→new-vec, tombstone 7; b2: adds 8100-8104, override 123, tombstone 99) |
|---|---|
| Branch-local writes | b1's add 8000 is top-1 on b1 only — invisible to `base` and `b2`; b2's add 8100 invisible to `base` and `b1` |
| Override / child-wins | b1 returns its NEW vector for id 42; collisions resolve child-wins in `query()` merge and re-rank |
| Tombstones | `b1.delete([7])` masks id 7 from **all** b1 queries while `base` still returns it; b2's tombstone of 99 is branch-local (b1 still sees 99) |
| Checkpoint | `b1.checkpoint('clean')` freezes a COW node (4843 B with tracked edits) and continues in a fresh child; node file exists on disk |
| Rollback | After poisoning b1 (5 adds 9000-9004 + override of id 100), `b1.rollback(ckptId)` **removed the poison file from disk**, dropped it from lineage, reverted the id-100 override to the original base vector, and preserved clean adds/override/tombstone. Post-rollback lineage `[working, clean, base]` |
| Diff | `{added:[8000..8004], overridden:[42], deleted:[7]}` on b1 and `{added:[8100..8104], overridden:[123], deleted:[99]}` on b2 — all three shapes populated on both branches. Diff is **working-node-scoped** (delta since the last checkpoint/isolate); accumulated chain deltas via `lineage()` |

**Quarantine/reject analog (zero blast radius):** b2 was checkpointed
(`'quarantine-poison'`), then discarded (`close()` + child rm) — the base never saw a
single b2 edit, and b1 stayed healthy.

**CLI corroboration:** `agenticow init/ingest/branch/checkpoint/query/diff/lineage/rollback`
ran the same mechanics on a 300-vector fixture, including `✓ branched … 4.451 ms / 162 B`
and `✓ rolled back … in 4.863 ms` — API and CLI agree; verbs are local-only.

### AC-5 — Degraded/expired/rejected/quarantined/rolled-back: explicit seam ✅

**agenticow has NO status model** (recon §2 invariant-8 seam confirmed in code: `status()`
returns engine stats + `chainDepth`/`dimension`/`metric`, not lifecycle states). The
fixtures therefore prove the **mechanical equivalents** and record where the **STATE
lives — app-level** (27.1 `branch_registry` / 27.6 gate):

- **rolled_back** ← `rollback(checkpointId)` reverted the poison (mechanics proven in AC-4); the
  `status=rolled_back` **value lives app-level**.
- **quarantined** ← `checkpoint('quarantine-poison')` after poisoning **freezes the bad state**
  as a COW node (that is the quarantine analog); STATE stays app-level. Library retention is
  unbounded (until `close()`/rm) — no TTL.
- **rejected** ← do-not-promote + `close()`/rm child; base untouched (proven). No native
  reject concept; 27.3's promotion gate owns `status=rejected`.
- **degraded** ← `fork({nativeAnn:true})` degrades to exact JS read-through when the native
  path throws; **on this host (linux-x64) nativeAnn engaged (effective: true)** — see note below.
- **expired** ← **no library mechanism at all**; retention/expiry is purely app-level
  (`retention_expires_at`).

**nativeAnn note (honest):** this host is `linux-x64-gnu` (Ubuntu 24.04, x86_64) and
`RvfDatabase.branch()` exists in rvf-node@0.2.3's native binding, so
`fork({nativeAnn:true})` engaged the native COW dual-graph path
(`nativeAnn: true`, sample read-through hit intact). The **degraded** path (non-linux-x64 →
`nativeAnn === false`) was verified **in source** (§5) but not exercised on this host;
the recon `reject` verdict on `nativeAnn`-as-shipped stands (linux-x64-only surface).

### AC-6 — Machine-readable metrics ✅

`spike-27.2-fixture-metrics.json` holds dataset/dim/hardware/storage/latency/recall verbatim.
Summary (hardware: **AMD Ryzen 7 5800XT (16 threads), 30.3 GB RAM, linux-x64, Node v24.19.0**;
base 5,000 × dim 128, cosine; 25 iterations per op; 30 queries for recall):

| Metric | min | p50 | p95 | max |
|---|---:|---:|---:|---:|
| fork (exact, base.rvf 2.60 MB) | 4.32 | **4.50** | 5.63 | 13.46 ms |
| query base (k=10) | 0.296 | **0.311** | 0.346 | 0.381 ms |
| query branch read-through (k=10) | 0.347 | **0.395** | 0.701 | 0.744 ms |
| checkpoint | 4.29 | **4.45** | 5.74 | 13.28 ms |
| rollback | 4.43 | **4.63** | 5.00 | 9.72 ms |
| diff | 0.197 | **0.235** | 0.308 | 0.763 ms |

Storage: base.rvf 2,600,603 B; **empty fork child 162 B (claim exactly reproduced)**;
clean-checkpoint node 4,843 B (with tracked edits) — delta ~5 KB for 6 edits, consistent
with the README's ~520 B/edit figure; fixtures dir total 2.67 MB.

Recall (author acceptance method — brute-force ground truth `base ∪ edits − tombstones`
reranked by exact distance): **recall@10 = 100.00%**, **exact-order match 100.0%** (30
queries); base-vs-branch read-through top-10 overlap 99.7% (expected <100%: branch
overrides id 42 / tombstones 7).

### Discrepancies vs marketing claims (measured → honest)

| Marketing claim | Measured here (5800XT, dim 128, base 5,000) | Verdict |
|---|---|---|
| Fork ~0.5 ms | **p50 4.50 ms** (min 4.32 / max 13.46) | **Not reproduced at this base size/hardware.** The checked-in `bench/results.json` shows COW is *slower than full copy* below ~10k vectors (speedup 0.718 @ 10k) — this 5k-base measurement sits on the losing side of the crossover, and the 5800XT is older than the author's 9950X. Flat O(1)-in-base cost is real and confirmed; the *0.5 ms magnitude* is not portable |
| Empty branch 162 B | **162 B exactly** | ✅ Reproduced exactly |
| Rollback ~0.5 ms | **p50 4.63 ms** (min 4.43 / max 9.72) | Not reproduced as 0.5 ms (10×) — same crossover/hardware read |
| Recall@10 = 100% | **100.0%** (30 queries, exact path) | ✅ Reproduced (exact read-through is the correctness core) |
| native ANN across branch | engaged on this linux-x64 host | Behavior matches docs on linux-x64; platform-constrained claim unchanged (§9) |

The task-brief secondary source ("fixed ~20 ms fork, wins past ~21k-vector crossover") was
unverifiable (gunbark.dev auth-walled, §9 note); its *direction* is consistent with the
checked-in bench and with our measurement (COW loses at 5k).

### Cleanup (per §8 rollback path)

`/tmp/agenticow-recon/fixtures/` (incl. CLI smoke) and `/tmp/agenticow-recon/fixture-env/`
were `rm -rf`'d after measurement. Deliberately kept: the pinned recon clone
`/tmp/agenticow-recon/repo` (the pin reference) and this note + metrics JSON in
`docs/archive/allura/evidence/epic-27/`. `Allura_Memory` git state: only the 27-2 story +
spike note + metrics JSON changed; **nothing committed.**
