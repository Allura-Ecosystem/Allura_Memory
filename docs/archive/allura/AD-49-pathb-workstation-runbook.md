# AD-49 Path B — Workstation Handoff Runbook

> [!NOTE]
> **AI-Assisted Documentation (Claude / Brooks).** Operational runbook staged in `docs/archive/allura/`.
> Drives the Path B verification work that **cannot run from the Cowork sandbox** (needs the live
> `.node` binding built for your box + a running dashboard). Faithful to the verified gaps in
> [`AD-49-ruvector-graph-cutover.md`](./AD-49-ruvector-graph-cutover.md) (G1–G5, empirical crate API, npm 404).
>
> **Brooks orchestration, approved by Sabir 2026-06-24.** Three specialists, one acceptance gate.
> Default backend stays `neo4j` until the three-way parity gate is green on a live DB.

---

## The incision

The `IGraphAdapter` seam already exists and the scaffold (`ruvector-crate-adapter.ts`) type-checks clean
with honest `NOT_VERIFIED` guards. Path B turns those guards into working method bodies against the real
ruvnet `ruvector-graph-node` binding — **invisible to the rest of Allura**, because nothing above the
factory knows which engine backs the graph.

Nobody flips a default in this runbook. The output is a **third selectable backend**
(`GRAPH_BACKEND=ruvector-crate`) proven at parity with the existing two. Promotion to default is a later,
separately-gated decision (AD-33 / Sabir).

---

## Sequencing (why this order)

```
Hightower  ──build & vendor the .node──▶  Knuth ──implement 16 bodies──▶  Woz ──parity gate──▶  HITL
   (no binding = nothing to test)          (needs the live binding)        (needs working bodies)   (Sabir)
                                                     │
                                              run in parallel once
                                              the binding loads
```

Hightower is the hard dependency. Until the addon loads under Bun on your machine, Knuth has nothing to
bind against and Woz has nothing to test. Once it loads, Knuth and Woz can interleave (Woz writes the
parity cases against the method signatures while Knuth fills bodies).

---

## Stage 1 — Hightower: build & vendor the native addon (G4)

**Charge.** Produce a loadable `ruvector-graph-node` `.node` addon for this workstation, vendor it into
the repo at a known path, and wire the two env vars the factory reads. Record a reproducible transcript.

**Why it's first.** `ruvector-graph-node` is **not on npm** (404 confirmed). It is a pure NAPI-RS `cdylib`
— compiles to a `.so` you rename to `.node`. No JS wrapper ships in the crate dir.

### Steps

```bash
# 1. Fetch only what's needed (full clone is large; blobless sparse-checkout is fast)
git clone --filter=blob:none --no-checkout https://github.com/ruvnet/RuVector
cd RuVector
git sparse-checkout set crates/ruvector-graph-node crates/ruvector-graph
git checkout

# 2. Patch the workspace so it doesn't abort on missing examples/benches
#    Root Cargo.toml: members = ["crates/*"]   (drops examples/refrag-pipeline, ruvector-core demo)

# 3. Release build (CPU only — RTX 3070 not required; HNSW/SimSIMD are CPU)
cargo build --release --manifest-path crates/ruvector-graph-node/Cargo.toml
#    → produces target/release/libruvector_graph_node.so  (~5.1MB in the sandbox spike)

# 4. Vendor into the repo at a stable, documented path
mkdir -p vendor/ruvector-graph
cp target/release/libruvector_graph_node.so \
   /path/to/allura-memory/vendor/ruvector-graph/ruvector_graph_node.node

# 5. Smoke-load under Bun (this is the Path B go/no-go — passed in the sandbox spike)
cd /path/to/allura-memory
bun -e 'const g=require("./vendor/ruvector-graph/ruvector_graph_node.node"); console.log(Object.keys(g))'
#    EXPECT: 8 exports including GraphDatabase
```

### Env wiring (what the factory reads)

```bash
# factory.ts → createGraphAdapter() requires these when GRAPH_BACKEND=ruvector-crate
export RUVECTOR_GRAPH_NODE_PATH=/path/to/allura-memory/vendor/ruvector-graph/ruvector_graph_node.node
export RUVECTOR_GRAPH_STORAGE_PATH=/path/to/allura-memory/.data/ruvector-graph
```

### Governance gate (G4 — Bun-only / zero-trust tension)

Vendoring a **compiled native artifact** tensions with the Bun-only, zero-trust supply-chain rule.
Before this `.node` lands in a committed path, write a short **governance AD** answering:

- provenance: exact commit SHA of `ruvnet/RuVector` built from, build host, toolchain version (sandbox spike: Rust 1.95.0, x86_64 Linux);
- integrity: checksum of the vendored `.node`, recorded in the AD;
- rebuild path: the commands above, so the artifact is reproducible, not a mystery blob.

**Done when:** `bun -e require(...)` prints the 8 exports, both env vars resolve, and the provenance AD
exists in `docs/archive/allura/`. Hand the loaded-binding transcript to Knuth.

**Hightower tool boundary:** infrastructure-as-code only — the build + vendor steps are scripted and
checked in, no manual untracked binary drops.

---

## Stage 2 — Knuth: implement the 16 method bodies

**Charge.** Replace every `NOT_VERIFIED` guard in `src/lib/graph-adapter/ruvector-crate-adapter.ts` with a
working body against the live binding, enforcing the governance invariants **in the adapter** (the engine
won't enforce them for you).

### Empirical crate API (verified, differs from the README)

- static `GraphDatabase.open(path)` → handle
- **native transactions:** `begin` / `commit` / `rollback`
- `createNode({ id, embedding: Float32Array /* REQUIRED */, labels?, properties?: Map<String,String> })`
- `createEdge(type, from, to, properties?)` · `createHyperedge(...)`
- `deleteNode` / `deleteEdge` / `deleteHyperedge` — **exist, but the adapter never calls them on history**
- `query` / `querySync` (Cypher) · `kHopNeighbors` · `searchHyperedges` · `subscribe` · `stats` · `getStoragePath` · `isPersistent` · `batchInsert`
- **No `updateNode`.** Deprecation is expressed by edge existence, never by node mutation.

### Invariant enforcement (non-negotiable)

| Gate | Rule in the adapter |
|------|---------------------|
| **G1 — append-only / SUPERSEDES** | `supersedesMemory` = `begin` → `createNode(new)` + `createEdge("SUPERSEDES", new→old)` → `commit`. Atomic via native transaction. Never call `deleteNode`/`updateNode` on history. |
| **G2 — search** | `searchMemories` routes vector similarity through Cypher `query`/`querySync` (no standalone `searchSimilar`). Embed with `nomic-embed-text` (768d) via the injected `Embedder`. Keyword parity is a **behavior change** — flag any divergence for the upstream text-index ask. |
| **G3 — tenant scoping** | `group_id` (`^allura-[a-z0-9-]+$`) is a node property, filtered in **every** Cypher/traversal. `assertGroupId` already guards method entry — keep it, and add the WHERE clause. |
| **G5 — vector-first + stringly-typed props** | `createMemory` must produce a 768d embedding at create time (no embed-later). String-serialize typed fields (`score`, `version`, `status`, `confidence`) into `Map<String,String>`; parse back on read. |

### 16-method mapping (target)

| IGraphAdapter | Crate operation |
|---------------|-----------------|
| `createMemory` | `createNode({id, embedding /* REQUIRED */, labels:["Memory"], properties})` |
| `checkDuplicate` | Cypher `query` on content hash / vector similarity |
| `supersedesMemory` | `begin` → `createNode(new)` + `createEdge("SUPERSEDES", new→old)` → `commit` |
| `softDeleteMemory` | `createEdge("DELETED", tombstone→mem)` — marker, not mutation |
| `restoreMemory` | `deleteEdge("DELETED", …)` — the one allowed deletion (removing a tombstone) |
| `getMemory` | `getNode` / Cypher by id |
| `searchMemories` | Cypher `query`/`querySync` (vector) — G2 |
| `listMemories` | Cypher `MATCH (m:Memory) WHERE group_id … ORDER BY …` — G3 |
| `countMemories` | Cypher `count` — G3 |
| `checkCanonical` | edge-absence (no incoming SUPERSEDES/DELETED) |
| `getVersion` | node property |
| `exportMemories` | Cypher `MATCH` all in group — G3 |
| `getDeprecatedMemories` | Cypher `MATCH` nodes with incoming `SUPERSEDES` |
| `linkMemoryContext` | `createEdge("AUTHORED_BY")` + `createEdge("CONTRIBUTES_TO")` — native, beats the PG-table no-op |
| `isHealthy` | `stats()` ping |
| `close` | drop handle |

**Channel caveat carried forward.** The sandbox confirmed build + load only. **Confirm Cypher dialect and
return shapes on your clean workstation channel** before trusting any query body — the crate's actual
`query` return shape must be observed, not assumed from the README.

**Done when:** no `NOT_VERIFIED` remains, every method enforces its gate, and a manual CRUD smoke
(create → supersede → search → soft-delete → restore) round-trips against the live binding.

---

## Stage 3 — Woz: three-way parity gate (task #10)

**Charge.** Add `ruvector-crate` to `src/lib/graph-adapter/adapter-parity.test.ts` so the existing suite
runs **three-way** (neo4j / ruvector / ruvector-crate) and all backends agree.

- Parametrize the existing parity cases over the third backend; do not fork the suite.
- The suite currently passes **14/14** for the two PG/Neo4j backends (verified 2026-06-24) — the bar is
  three-way green, including the deliberate `linkMemoryContext` path and the SUPERSEDES immutability case.
- This is the **acceptance gate**. It plays the same role for `ruvector-crate` that the live-DB E2E
  (RK-15 / R5) plays for `ruvector`.

**Done when:** `bun run test` shows three-way parity green and the SUPERSEDES/append-only invariant holds
identically across all three engines.

---

## Acceptance gate (HITL — Sabir)

Path B is "verified" — **not** "default" — when **all** hold:

1. Hightower: addon loads under Bun on the workstation; provenance AD (G4) exists with checksum + rebuild path.
2. Knuth: zero `NOT_VERIFIED`; G1/G2/G3/G5 enforced in-adapter; manual CRUD round-trips on the live binding.
3. Woz: three-way `adapter-parity.test.ts` green.
4. Channel-clean confirmation of the crate's Cypher dialect + return shapes (closes the sandbox confabulation caveat).

**Default flip stays out of scope here.** `GRAPH_BACKEND` default remains `neo4j`. Making any RuVector
backend the default is gated separately on the live-DB E2E + dual-read validation + AD-33 promotion into
canonical `RISKS-AND-DECISIONS.md`.

---

## Upstream follow-ons (after the gate, to ruvnet/RuVector)

Keep the adapter thin so these flow back without a rewrite:

- **G2** — text/keyword index (BM25) so `searchMemories` keyword parity is native, not adapter-emulated.
- **G3** — tenant-scoped graphs so `group_id` isolation is engine-enforced, not adapter-enforced.
- **G1** — optional immutable/audit mode so append-only is a first-class guarantee.

---

## Parallel track — partner onboarding (independent of all the above)

Gabriel and Samuel do **not** wait on Path B. They onboard via admin-scoped MCP bearer tokens
(`POST /api/tokens`, dev-admin) with isolated `group_id`, getting governed Brain access through the
kernel regardless of which engine backs the graph. This is also workstation-only (needs the running
dashboard) but shares nothing with the graph cutover — run it in the same session or a separate one.

---

## Brooksian note

One architect owns the vision; the seam was placed once and everything rides it. Three specialists own
their domains completely — Hightower the artifact, Knuth the bindings, Woz the proof. No specialist
promotes their own work past the HITL gate. Conceptual integrity holds because the engine swap never
leaks above `createGraphAdapter()`.
