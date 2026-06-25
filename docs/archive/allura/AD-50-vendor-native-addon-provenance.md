# DRAFT — AD-50 / RK-16: Vendor a compiled native addon (`ruvector-graph-node`) under Bun-only / zero-trust

> [!NOTE]
> **AI-Assisted Documentation (Claude / Brooks).** Governance AD staged in `docs/archive/allura/`.
> **Not** promoted to canonical `docs/allura/RISKS-AND-DECISIONS.md` (AD-33-gated, Sabir approves).
>
> **Provisional number AD-50.** Canonical max is AD-48; AD-49 is the staged graph-cutover draft;
> AD-50 is the next provisional slot. Confirm/renumber against canonical at promotion time.
>
> **Purpose.** Resolve the explicit tension flagged as **G4** in
> [`AD-49-ruvector-graph-cutover.md`](./AD-49-ruvector-graph-cutover.md): the Path B graph engine
> requires a compiled native artifact that is **not on npm**, which collides with the Bun-only,
> zero-trust supply-chain policy. This AD is a **prerequisite gate** for Stage 1 of
> [`AD-49-pathb-workstation-runbook.md`](./AD-49-pathb-workstation-runbook.md) — the `.node` does not
> land in a committed path until this AD's fields are filled and reviewed.

---

## Context

`ruvector-graph-node` is a pure NAPI-RS `cdylib`. It compiles to a platform `.so` (renamed `.node`) and
is **not published to npm** (404 confirmed). To run `GRAPH_BACKEND=ruvector-crate`, Allura must build the
addon from source and **vendor the compiled binary** into the repo at a known path
(`vendor/ruvector-graph/ruvector_graph_node.node`).

This is the first compiled, non-source artifact proposed for the repo. The Bun-only / zero-trust policy
exists precisely to keep opaque binaries out of the supply chain. This AD makes the exception explicit,
auditable, and reproducible rather than letting a mystery blob appear in a commit.

---

## AD-50 — Vendor the native addon with full provenance

| Field | Value |
|-------|-------|
| **Status** | Proposed — **all four commit-conditions met AND reproducibility proven** (provenance filled; checksum matches the vendored `.node`; SHA pinned; Bun-load + subset parity verified; clean-checkout rebuild reproduces a **byte-identical** artifact, 2026-06-24); only remaining step is AD-33 promotion sign-off (Sabir) into canonical `RISKS-AND-DECISIONS.md` |
| **Owner** | Hightower (build/vendor) · Sabir (approval) · Brooks (architecture) |
| **Related** | AD-49 (Path B graph cutover — the consumer) · G4 constraint · RK-16 (below) |

**Decision.** Permit a single vendored native addon (`ruvector-graph-node`) under a documented exception
to the Bun-only / zero-trust policy, **conditional on** full provenance: the artifact is reproducible from
a pinned source commit with a recorded checksum, and is never a hand-dropped untracked binary.

**Rationale.**
1. The engine has no npm distribution — building from source is the *only* path, and building from a
   pinned SHA is **more** auditable than an opaque npm tarball, not less.
2. The addon stays behind the `IGraphAdapter` seam and is loaded only when `GRAPH_BACKEND=ruvector-crate`
   — zero blast radius on the default (`neo4j`) path.
3. Reproducibility (recorded commands + checksum) converts a trust problem into a verification problem.

**Conditions (all required before the `.node` is committed).**
- Provenance table below is fully filled (no empty placeholders).
- Checksum recorded here matches the committed artifact.
- Rebuild commands reproduce a byte-or-checksum-equivalent artifact on a clean checkout.
- Loaded under Bun on the target host (the runbook Stage 1 smoke test passed).

---

## Provenance record — Hightower fills post-build

> Fill every `<…>` placeholder. Leaving any blank **blocks** the commit per the conditions above.

| Field | Value |
|-------|-------|
| Upstream repo | `https://github.com/ruvnet/RuVector` |
| Pinned commit SHA | `85d231478041ae72d048fa59dac58db224798500` — captured 2026-06-24 from the rebuild clones (`/tmp/RV` and `/tmp/RuVector` reported the identical SHA); crate version **2.2.3** |
| Crate | `crates/ruvector-graph-node` (NAPI-RS `cdylib`) |
| License | MIT |
| Build host OS / arch | Ubuntu (sandbox) / x86_64 / glibc 2.39 |
| Rust toolchain | rustc 1.95.0, cargo 1.95.0 |
| Bun version | 1.3.11 |
| Output artifact | `target/release/libruvector_graph_node.so` — **5,113,328 bytes** |
| Vendored path | `vendor/ruvector-graph/ruvector_graph_node.node` |
| SHA-256 checksum | `21a07d72a0b7a4f1741d063d7a028318d640ca3551264c7a06590c18408638a8` |
| Bun load verified | **yes** — `Object.keys()` printed 8 exports incl. `GraphDatabase`; `version()` → `2.2.3`; 18 prototype methods |

> [!IMPORTANT]
> **The checksum above is from a *manifest-patched* build** (see recipe below — raft/cluster/replication
> path-deps stripped from `crates/ruvector-graph/Cargo.toml`). It will only reproduce byte/checksum-equivalent
> if the same patch is applied. The patch is part of the reproducible recipe, not an ad-hoc edit.
> **Resolved 2026-06-24:** a clean-checkout rebuild reproduced this exact SHA byte-for-byte with the patch
> applied (see the clean-checkout note below the recipe) — the manifest patch is deterministic.

### Reproducible rebuild (manifest-patched — required)

```bash
git clone --filter=blob:none --no-checkout https://github.com/ruvnet/RuVector
cd RuVector
git checkout <PINNED_SHA>
git rev-parse HEAD            # capture for the provenance table
# NOTE the trailing `patches` path — the root Cargo.toml has a
#   [patch.crates-io] hnsw_rs = { path = "./patches/hnsw_rs" }
# entry, so the patches/ dir MUST be materialized or resolve fails (rc=101,
# "unable to update .../patches/hnsw_rs"). Omitting it was the gap in the
# first recipe; the clean-checkout rebuild on 2026-06-24 caught it.
git sparse-checkout set crates/ruvector-core crates/ruvector-graph crates/ruvector-graph-node patches

# Patch 1 — root Cargo.toml: pin members to the 3 crates we build
#   members = ["crates/ruvector-core","crates/ruvector-graph","crates/ruvector-graph-node"]
#
# Patch 2 — crates/ruvector-graph/Cargo.toml: cargo loads ALL optional path-dep manifests at
#   resolve time even when their feature is OFF. raft/cluster/replication dirs are not checked
#   out, so resolve fails (rc=101). Delete the three optional dep lines AND the distributed/
#   federation feature lines (keep a .orig backup for idempotency):
#     - ruvector-raft        = { path = "../ruvector-raft", optional = true }
#     - ruvector-cluster     = { path = "../ruvector-cluster", optional = true }
#     - ruvector-replication = { path = "../ruvector-replication", optional = true }
#     - distributed = [...]   federation = [...]   feature lines

cargo build --release -p ruvector-graph-node
sha256sum target/release/libruvector_graph_node.so   # must match the checksum recorded above
```

> [!NOTE]
> **Clean-checkout reproduction — 2026-06-24 (byte-identical).** Ran the full recipe above from a
> fresh `--no-checkout` clone at the pinned SHA `85d2314…` in an isolated dir (`/tmp/RV-clean`), no
> shared cargo/target cache. Result: `BUILD_RC=0`, `Finished release in 1m 38s`, artifact
> **5,113,328 bytes**, sha256 **`21a07d72a0b7a4f1741d063d7a028318d640ca3551264c7a06590c18408638a8`**
> — **byte-identical** to the vendored `.node` (not merely checksum-equivalent). The only delta from
> the original recipe was the `patches` sparse-checkout path (now folded in above). This is the
> reproducibility proof for promotion-checklist item 2.

---

## RK-16 — Vendored native addon supply-chain risk

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Likelihood** | Low |
| **Status** | 🟡 Open — all technical mitigations in place (reproducible rebuild proven byte-identical; CI checksum gate live); residual "Open" only until AD-33 promotion into canonical `RISKS-AND-DECISIONS.md` (Sabir) |
| **Owner** | Hightower |
| **Related decision** | AD-50 · AD-49 |

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Opaque binary enters the supply chain | Pinned SHA + recorded checksum + reproducible rebuild — **verified byte-identical on a clean checkout 2026-06-24**; review the provenance table before merge. |
| R2 | Drift between committed `.node` and source | Checksum recorded here; CI re-verifies via `bun run validate:vendor` against `vendor/ruvector-graph/CHECKSUMS.sha256` (wired into the lint job; passes on the committed `.node`, rejects a tampered copy). |
| R3 | Platform lock-in (built for one arch) | Document the target arch; the addon loads only behind `GRAPH_BACKEND=ruvector-crate`, never on the default path, so other hosts are unaffected. |
| R4 | Upstream `v0.1.x` churn breaks the ABI | Pinned SHA insulates against drift; rebuild is an explicit, reviewed step, never automatic. |

**Mitigation summary.** The exception is narrow (one addon, one path, one flag), reproducible (pinned SHA
+ checksum + commands), and contained (off the default backend). Neo4j and the PG-table `ruvector`
backend carry no native artifact and are unaffected.

---

## Promotion checklist (AD-33-gated — Sabir)

- [x] Provenance table fully filled; checksum matches the committed `.node`. *(2026-06-24 — SHA pinned `85d2314…`, vendored `.node` sha `21a07d72…`, 5,113,328 B.)*
- [x] Rebuild reproduces an equivalent artifact on a clean checkout. *(2026-06-24 — from-scratch `--no-checkout` clone at `85d2314…` in isolated `/tmp/RV-clean`, no shared cache: `BUILD_RC=0`, 1m38s, sha `21a07d72…`, 5,113,328 B — **byte-identical** to the vendored `.node`. Recipe corrected: `patches/` sparse-checkout path added for the `[patch.crates-io] hnsw_rs` dep.)*
- [x] Bun load smoke test passed on the target host. *(Subset parity 20/20 green on the real `.node`, 3072ms native; see section above.)*
- [ ] AD-50 + RK-16 promoted into canonical `RISKS-AND-DECISIONS.md` (same PR as the vendored artifact). *(AD-33-gated — Sabir.)*
- [x] Checksum-verification step added to CI or pre-commit. *(2026-06-24 — `bun run validate:vendor` → `scripts/verify-vendor-checksums.ts`, manifest `vendor/ruvector-graph/CHECKSUMS.sha256`; wired into `.github/workflows/ci.yml` lint job. Verified: passes on the committed `.node`, rejects a tampered copy. `.git/hooks` is a worktree file, so CI — not a local git hook — is the enforcement point.)*

---

## Empirical API verification (sandbox functional probe — 2026-06-24)

> **Method.** Built the real addon (above), loaded under Bun, ran a fully-awaited CRUD + transaction probe
> against a persistent DB. Every value below is from a **file-tool read of the probe's JSON output**, not
> from shell narration. This supersedes the earlier *source-read-only* assessment, which was wrong about
> retrieval (it works) and right about transactions (they don't).

### What works (better than the source read implied)

| Capability | Evidence |
|------------|----------|
| Persistent storage | `open()` → `isPersistent: true`, `storagePath` honored |
| `createNode` | async; **returns the node id** (`"ins_a"`) |
| `createEdge` | async; returns a UUID edge id |
| **Query-by-label retrieval** | `await query('MATCH (n:Memory) RETURN n')` → **both nodes with `id`, `labels`, `properties`** + `stats{totalNodes:2,totalEdges:1}` |
| Edge semantic search | `searchHyperedges({embedding,k})` → real vector hit on the SUPERSEDES edge (score ≈ 0 for identical embedding) |
| k-hop traversal | `kHopNeighbors('ins_b',2)` → `['ins_b','ins_a']` |
| `stats` | accurate node/edge/avg-degree counts |

### Hard blockers for a *faithful* Allura semantic-graph backend

| # | Blocker | Empirical evidence | Impact |
|---|---------|--------------------|--------|
| **B1** | **No transaction atomicity** | `begin()` → txid; `createNode('ins_c')`; `rollback(txid)` → `stats.totalNodes` went **2 → 3** and `query` still lists **`ins_c`**. Rollback is a bookkeeping no-op; it does **not** undo writes. | Breaks atomic versioned promotion. A failed multi-step SUPERSEDES cannot be rolled back. |
| **B2** | **Lossy property round-trip** | Stored `confidence:"0.9"`; read back as the literal string **`String("0.9")`** (Rust `{:?}` debug formatting leaks into the value). | Every property read is corrupted; adapter must unwrap `String("…")` — fragile and lossy for non-string types. |
| **B3** | **No node-level mutation (no `updateNode`)** | 18 prototype methods; none mutate a node. | Cannot set `:deprecated` on the superseded node — the core of Neo4j SUPERSEDES versioning. |

### Structural limits (workaroundable, but semantic divergence)

- **No node semantic search** — `searchHyperedges` is **edge-only**; node embeddings are stored but not queryable by similarity. Node similarity would need a TS-side index or reuse of the edge path.
- **`querySync` returns no nodes** — only `stats` is populated; retrieval requires the async `query`.
- **Cypher is match-by-label only** — no `WHERE`, no property filter, no vector in Cypher.
- **Reserved-prefix label parse bug** — `MATCH (n:Insight)` fails: `Cypher parse error … found In` (parser reads the `In` prefix as the `IN` operator). Label names must avoid reserved-word prefixes (`Memory` works, `Insight` does not).
- **Edges invisible to the property-graph query path** — `query` returns `edges: []` despite `totalEdges:1`; edges live in the hypergraph index (reachable via `searchHyperedges`), `create_edge`→hypergraph while `delete_edge`→property graph (inconsistent stores).
- **No in-memory mode — `storagePath` is always file-backed** *(found 2026-06-24 during the real-binding parity run)*. Passing `":memory:"` does **not** open an ephemeral DB the way SQLite does; the real `.so` creates a literal file named `:memory:` on disk. The fake fixture ignores `storagePath`, so the subset tests still pass with `":memory:"` — but a real-binding run must point `RUVECTOR_TEST_STORAGE_PATH` at a real temp dir (e.g. `mktemp -d`) and clean it up, or it litters the cwd. Operational note for the adapter: callers must supply a real filesystem path; there is no in-memory option.

### Verdict for Path B (`GRAPH_BACKEND=ruvector-crate`)

The native binding is **buildable, loadable, and functionally richer than feared for retrieval** — but **B1 (no atomicity)** and **B3 (no node mutation → can't deprecate)** mean it **cannot be a drop-in faithful replacement for the Neo4j SUPERSEDES model** without adapter-side emulation that changes semantics. A three-way `adapter-parity.test.ts` green is therefore **not honestly achievable as-is**; forcing one would violate the "never claim code works without testing" invariant.

**Recommended framing (Sabir to decide):**
- **Option A — Experimental retrieval backend.** Ship `ruvector-crate` as a *non-transactional, retrieval-oriented* backend with B1–B3 documented as known limits. Parity test asserts the **subset** it honestly passes (create/retrieve/traverse/edge-search), explicitly skips atomicity + deprecation. Lowest risk; default stays `neo4j`.
- **Option B — Adapter-side emulation.** Build TS-side compensation (write-ahead log for atomicity, property-string unwrapping for B2, marker-node/edge for deprecation instead of `:deprecated`). Real work; diverges from Neo4j semantics; needs its own AD.
- **Option C — Upstream the gaps.** File issues / PRs on `ruvnet/RuVector` for `updateNode`, real transactions, and `{:?}`-leak in property serialization; hold Path B until landed.

Default backend remains **`neo4j`** under all three. Nothing here touches the live path.

---

## Option A — subset parity executed against the REAL binding (2026-06-24)

> **Decision taken:** Option A. The `ruvector-crate` adapter ships as a non-transactional,
> retrieval-oriented backend; B1/B2/B3 are documented limits; the blocker-dependent ops
> (`supersedesMemory`, `softDeleteMemory`, `restoreMemory`) **throw `unsupported:`** rather than
> fake success. Default backend stays `neo4j`; `ruvector-crate` is opt-in via `GRAPH_BACKEND`.

**Test:** `src/lib/graph-adapter/__tests__/ruvector-crate-adapter.subset.test.ts` (20 tests) drives the
adapter logic — G3 tenant scoping, B2 `String("…")` unwrap on round-trip, keyword search, list/count/
version/pagination, edge linking, and the three honest `unsupported:` refusals. It runs against the fake
fixture by default and against the **real vendored `.node`** when `RUVECTOR_TEST_BINDING_PATH` /
`RUVECTOR_TEST_STORAGE_PATH` are set — so the same assertions prove the fake matches reality.

| Run | Binding | Result | Native signal |
|-----|---------|--------|---------------|
| Fake fixture (default) | `fixtures/fake-ruvector-graph-node.cjs` | **20/20 passed**, exit 0 | tests 15ms |
| Real binding | `vendor/ruvector-graph/ruvector_graph_node.node` (sha `21a07d72…`) | **20/20 passed**, exit 0 | tests **3072ms** (native `.so` exercised) |

The ~200× runtime jump (15ms → 3072ms) confirms the real native code path was executed, not the fake.
This satisfies condition 4 (Bun-load smoke) and closes the "is a three-way parity green honestly
achievable?" question for the **honest subset**: yes — and it is green on the real artifact.

**Verification channel.** All pass/fail and checksums above were read via the file-tool `Read` channel
from command output redirected to repo files (`_fake_run.txt`, `_real_run.txt`, `_vendor.txt`), never from
shell narration — per the "never claim code works without testing" invariant.
