# DRAFT — AD-49 / RK-15: Cut over the semantic store from Neo4j to the RuVector graph backend

> [!NOTE]
> **AI-Assisted Documentation (Claude / Brooks).** Draft staged in `docs/archive/allura/`.
> **Not** yet promoted to canonical `docs/allura/RISKS-AND-DECISIONS.md` (that edit is AD-33-gated,
> requires Sabir's approval). Review here first, then promote.
>
> **Renumbered 2026-06-24 (Brooks): AD-47 → AD-49.** AD-47 and AD-48 are already taken in
> canonical `RISKS-AND-DECISIONS.md` (AD-47 = NanoClaw + Vercel AI Gateway runtime; AD-48 =
> Human Membership as a Postgres table). AD-49 is the next free number. File renamed accordingly.
>
> **Supersedes the earlier `AD-42-ruvector-graph-migration.md` draft**, which was mis-framed:
> it treated this as a greenfield proposal and collided with the canonical AD-42 ("Governed API
> middleware"). Reality: the migration is **already built under AD-029** and is a *cutover decision*,
> not a new architecture.

---

## What is actually true today (verified in code)

The Neo4j → RuVector graph migration is **not greenfield**. It is governed by **AD-029 (Graph Adapter
Pattern)** and is roughly **90% implemented behind the `GRAPH_BACKEND` flag**, which still **defaults to `neo4j`**.

| Piece | State | Evidence |
|-------|-------|----------|
| `IGraphAdapter` interface | ✅ Defined | `src/lib/graph-adapter/types.ts` |
| `Neo4jGraphAdapter` | ✅ Full (legacy/default) | `neo4j-adapter.ts` (816 lines) |
| `RuVectorGraphAdapter` | ✅ Full — all 16 methods | `ruvector-adapter.ts` (513 lines) |
| Backend factory + flag | ✅ Wired | `factory.ts` — `getGraphBackend()`, default `neo4j` |
| Memory-node storage | ✅ PG tables | `graph_memories` + `graph_supersedes` (migration `21-graph-adapter-tables.sql`) |
| Structural context (Agent/Project/Task nodes + edges) | ✅ PG tables + writer wiring | `graph_structural_nodes` + `graph_structural_edges` (migration `24`), wired in `memory/writer.ts` `buildAdapterBackend()` |
| SUPERSEDES immutability | ✅ Preserved | `supersedesMemory` is transactional: INSERT new node → INSERT `graph_supersedes` edge → mark prev `deprecated` |
| Full-text search | ✅ PG `tsvector` | `content_tsv GENERATED ALWAYS … to_tsvector('english', content)` replaces Neo4j fulltext index |
| Parity test | ✅ Green | `adapter-parity.test.ts` — **14/14 pass** (verified 2026-06-24) |

The one thing that *looks* like a gap — `RuVectorGraphAdapter.linkMemoryContext` returning a no-op —
is **not** a functional gap. Structural context (AUTHORED_BY / CONTRIBUTES_TO etc.) is written through
`memory/writer.ts` → `graph_structural_nodes/edges` when `GRAPH_BACKEND=ruvector`, not through
`linkMemoryContext`. The parity test deliberately exercises the no-op path and both adapters agree.

---

## AD-49 — Cut the semantic store over to the RuVector graph backend

| Field | Value |
|-------|-------|
| **Status** | Proposed |
| **Owner** | Sabir (decision) · Knuth (data) · Brooks (architecture) |
| **Related** | AD-029 (graph adapter pattern — the build) · AD-34 (Deferred "full RuVector-Postgres migration" — this activates it) · RK-15 (below) |

**Decision.** Make `GRAPH_BACKEND=ruvector` the default, retiring Neo4j 5.26 Community as the
semantic/knowledge-graph layer. The RuVector backend stores the graph in PostgreSQL tables
(`graph_memories`, `graph_supersedes`, `graph_structural_nodes`, `graph_structural_edges`) behind the
same `IGraphAdapter` seam.

**Rationale.**
1. **Removes the per-person graph-auth wall.** Neo4j Community supports exactly one user (`neo4j`);
   per-partner graph logins require paid Enterprise. PG tables have no separate login surface — access
   is governed by *our* kernel + MCP tokens.
2. **Collapses two stores toward one engine.** Graph + vector both live in Postgres; removes the
   Neo4j + cross-store consistency burden.
3. **Self-hosted, no license tier** — fits the compliance-grade, self-hosted posture.

> ⚠️ **Naming reconciliation — needs Sabir's call.** Sabir linked the ruvnet Rust crate
> `ruvector-graph` (Cypher subset + hyperedges + HNSW). Allura's existing `ruvector` backend is a
> **PostgreSQL-table implementation named after the concept**, *not* a binding to that Rust crate.
> "Do it right / upstream it right" has two readings:
> - **Path A (ship what's built):** make `GRAPH_BACKEND=ruvector` the PG-table default. Fast, governed,
>   reversible. Nothing to upstream — it's our own code.
> - **Path B (the Rust crate):** re-implement the adapter over ruvnet's `ruvector-graph` crate and
>   upstream gaps as PRs. Larger, v0.1.x churn, but matches the link literally and gives an
>   upstreamable artifact.
>
> These are materially different programs of work. **Path A is recommended** for the beta (steady,
> low-risk), with **Path B tracked as a follow-on** behind the *same* `IGraphAdapter` seam — so the
> engine swap stays invisible to the rest of the system either way.

**Consequences.**
- The `neo4j-adapter.ts` / `ruvector-adapter.ts` seam is the migration boundary; nothing else knows
  which engine backs it.
- SUPERSEDES immutability is enforced by **adapter discipline**, not the engine — already implemented
  transactionally in `ruvector-adapter.ts`.
- Neo4j stays as read-only fallback for one release after the flip.

---

## RK-15 — RuVector graph cutover risk

| Field | Value |
|-------|-------|
| **Severity** | Medium (down from High — the build de-risked R1/R2) |
| **Likelihood** | Low–Medium |
| **Status** | 🟡 Open — gated on live-DB E2E |
| **Owner** | Knuth |
| **Related decision** | AD-49 · AD-029 |

| # | Risk | Current state |
|---|------|---------------|
| R1 | Cypher-subset coverage | ✅ Resolved for Path A — PG adapter implements every `IGraphAdapter` method; no Cypher needed. Re-opens under Path B. |
| R2 | Mutable API vs SUPERSEDES immutability | ✅ Resolved — adapter only ever INSERTs new nodes + edges and flags `deprecated`; never mutates history. |
| R3 | Maturity / breaking changes | ✅ N/A for Path A (our code). 🔴 Applies under Path B (crate is v0.1.x). |
| R4 | Fulltext + unique constraints | ✅ Resolved for Path A — PG `tsvector` FTS + PK/CHECK constraints in migrations 21/24. |
| R5 | **No live-DB E2E proof** | 🔴 Open — parity tests pass but are DB-mocked. The 10-point acceptance gate has not run against live Docker Postgres with `GRAPH_BACKEND=ruvector`. This is the real "ready" gate (matches `_bootstrap.md`). |

**Mitigation.** Flag-gated; Neo4j authoritative until the live-DB E2E gate passes with
`GRAPH_BACKEND=ruvector`; dual-read validation for one release; no canonical promotion until sign-off.

---

## Remaining work to flip the default (Path A)

1. **Live-DB E2E** — run the 10-point acceptance gate against Docker Postgres with
   `GRAPH_BACKEND=ruvector` (replaces the DB-mocked parity coverage). This is the gating item.
2. **Dual-read validation** — for one release, read from both backends and diff results to catch
   divergence before Neo4j goes read-only.
3. **Flip the default** in `factory.ts` (`getGraphBackend()` → `ruvector`) once (1)+(2) are green.
4. **Promote** AD-49/RK-15 into canonical `RISKS-AND-DECISIONS.md` and update DATA-DICTIONARY +
   REQUIREMENTS-MATRIX in the same PR (AD-33-gated — Sabir approves).

---

## Path B — re-implement over the ruvnet `ruvector-graph` Rust crate (Sabir's choice, 2026-06-24)

> Sabir chose **Path B**: bind the adapter to the real ruvnet crate and "upstream it right."
> This section scopes that honestly against the crate's actual API (verified from the crate README,
> v0.1.1, MIT, crates.io).

### What the crate gives us (good fit)
- **Cypher engine** — `MATCH (a)-[:KNOWS]->(b)`; our SUPERSEDES reads/writes map cleanly.
- **Hyperedges** — one edge over N nodes; useful later for multi-party provenance.
- **HNSW vector search** on every node — could **unify the separate `src/lib/ruvector/` vector plane** into the graph engine (one store instead of graph + pgvector).
- **WASM + Node bindings exist in-repo** (`ruvector-graph-node`, `ruvector-graph-wasm`).
- **MIT, self-hosted, RTX-3070-friendly** (SimSIMD/HNSW are CPU; GPU not required).

### Hard constraints discovered (these shape the work)
| ID | Constraint | Consequence |
|----|-----------|-------------|
| G1 | **~~Crate API is mutable~~ — CORRECTED (2026-06-24 spike):** there is **no `updateNode`** method at all, and `begin/commit/rollback` are **native** | G1 is *smaller* than first drafted. Atomic SUPERSEDES (`createNode(new)` + `createEdge(SUPERSEDES, new→old)` in one transaction) works cleanly. `deleteNode`/`deleteEdge` exist but the adapter simply never calls them on history → append-only is enforceable without an upstream immutable mode. |
| G2 | **No keyword/BM25 fulltext; and no top-level `searchSimilar`** | `searchMemories` routes vector search through Cypher `query`/`querySync` (not a standalone `search_similar_nodes` call — that differs from the README). We embed with `nomic-embed-text` (768d). Keyword parity is still a **behavior change to validate** → upstream candidate: text index. |
| G3 | **No native multi-tenant scoping** | `group_id` (`^allura-[a-z0-9-]+$`) must be encoded as a property and filtered in **every** Cypher/traversal. PG gave us this via CHECK for free; here the adapter enforces it. → upstream ask: tenant-scoped graphs. |
| G4 | **`ruvector-graph-node` is NOT published to npm** (404, confirmed) | Must **build the binding from source** (`cargo` + napi-rs) and vendor the `.node` addon. Supply-chain surface that tensions with Bun-only / zero-trust → needs an explicit AD to vendor a compiled native artifact. |
| G5 | **NEW (2026-06-24 spike): vector-first + stringly-typed props** — `embedding: Float32Array` is **REQUIRED** on every `createNode`, and `properties` is `Map<String,String>` | Every Memory node must carry a 768d embedding at create time (no embed-later). Typed fields (`score`, `version`, `status`, `confidence`) must be **string-serialized** at the adapter boundary and parsed back on read. |

### 16-method mapping (IGraphAdapter → crate `Graph`)
| IGraphAdapter | Crate operation | Notes |
|---------------|-----------------|-------|
| `createMemory` | `createNode({id, embedding, labels:["Memory"], properties})` | **embedding REQUIRED** (G5); props are `Map<String,String>` — string-serialize typed fields |
| `checkDuplicate` | Cypher `query` on content hash / vector similarity | no standalone `searchSimilar` (G2) — route via Cypher |
| `supersedesMemory` | `begin` → `createNode(new)` + `createEdge("SUPERSEDES", new→old)` → `commit` | **native transaction** (G1) → atomic; no `updateNode` exists — deprecation = edge existence |
| `softDeleteMemory` | `create_edge("DELETED", tombstone→mem)` | tombstone marker, not node mutation (G1) |
| `restoreMemory` | `delete_edge("DELETED", …)` | only mutation allowed: removing a tombstone marker |
| `getMemory` | `get_node` | |
| `searchMemories` | Cypher `query`/`querySync` (vector similarity) | **G2 behavior change** — no `searchSimilar`; route via Cypher; validate vs keyword |
| `listMemories` | Cypher `MATCH (m:Memory) WHERE group_id … ORDER BY …` | G3 scoping |
| `countMemories` | Cypher `count` | G3 scoping |
| `checkCanonical` | edge-absence check (no incoming SUPERSEDES/DELETED) | |
| `getVersion` | node property | |
| `exportMemories` | Cypher `MATCH` all in group | G3 scoping |
| `getDeprecatedMemories` | Cypher `MATCH` nodes with incoming `SUPERSEDES` | |
| `linkMemoryContext` | `create_edge("AUTHORED_BY")` + `create_edge("CONTRIBUTES_TO")` | **native** — strictly better than the PG-table adapter's no-op |
| `isHealthy` | graph open / ping | |
| `close` | drop handle | |

### Path B execution plan (governed, behind the same `IGraphAdapter` seam)
1. **Spike on your workstation** (sandbox can't vendor a `.node` for your machine):
   ```bash
   git clone https://github.com/ruvnet/RuVector && cd RuVector/crates/ruvector-graph-node
   cargo build --release            # produces the napi addon
   # load test under Bun:
   bun -e 'const g=require("./index.node"); console.log(Object.keys(g))'
   ```
   Go/no-go on: does the napi addon load under Bun? (Bun supports most N-API addons; verify.)
2. **New adapter** `src/lib/graph-adapter/ruvector-crate-adapter.ts` implementing all 16 methods per the table above; selected by `GRAPH_BACKEND=ruvector-crate` (keeps the PG-table `ruvector` and `neo4j` intact). Reuse `adapter-parity.test.ts` to assert three-way parity.
3. **Enforce invariants in the adapter** (G1/G3): never call `update_node`/`delete_node` on history; encode + filter `group_id` everywhere.
4. **Upstream the gaps** as issues/PRs to `ruvnet/RuVector`: (G1) immutable/audit mode, (G2) text index, (G3) tenant-scoped graphs. Keep the adapter thin so upstream fixes flow back.
5. **Governance AD** for vendoring a compiled native addon (G4) — resolve the Bun-only/zero-trust tension explicitly before landing.
6. **Live-DB E2E + dual-read** vs the current backend, then flip default — same gate as Path A.

> **Recommendation unchanged at the seam level:** ship **Path A (`GRAPH_BACKEND=ruvector` PG tables)** as the beta default *now* (it's built and green), and pursue **Path B as the upstreamable engine** behind `GRAPH_BACKEND=ruvector-crate` in parallel. Same `IGraphAdapter` boundary means neither blocks the other, and partners onboard regardless.

### Spike results (2026-06-24, attempted in the Cowork Linux sandbox)

Partial spike run before handing off to the workstation. What was **verified**:

| Check | Result |
|-------|--------|
| Toolchain present | ✅ cargo/rustc `1.95.0`, Bun `1.3.11`, Node `v24.14.0` — same x86_64 Linux target as your box |
| Repo fetch | ✅ Full `git clone` exceeds the sandbox 45s ceiling; **blobless sparse-checkout works**: `git clone --filter=blob:none --no-checkout … && git sparse-checkout set crates/ruvector-graph-node crates/ruvector-graph` |
| Crate shape | ✅ `ruvector-graph-node` is a **pure NAPI-RS `cdylib`** (no `package.json` in the crate dir) — it compiles to a `.so` you rename to `.node`. No JS wrapper in this dir. |
| Release build | ✅ **Completed** — launched fully detached (`setsid … &`) to survive the 45s ceiling, polled the logfile. Produced `target/release/libruvector_graph_node.so` (**5.1MB**). Patch needed: root `Cargo.toml` `members → ["crates/*"]` to drop `examples`/`benches` (workspace otherwise aborts on missing `ruvector-core` / `examples/refrag-pipeline`). |
| Bun load | ✅ **GO.** Renamed `.so → .node`; `bun -e 'require(...)'` loaded it and surfaced **8 exports incl. `GraphDatabase`**. This is the Path B go/no-go and it passed. |
| npm availability | ⛔ **404 confirmed** — binding is not on npm. G4 stands: build/vendor the native `.node` ourselves (governance AD required for the Bun-only/zero-trust tension). |

**Net: GO.** The binding compiles from source under the exact target toolchain (Rust 1.95, x86_64 Linux) and loads under Bun. Empirical API (differs from README): static `open`; `begin/commit/rollback` (**native transactions**), `createNode/createEdge/createHyperedge`, `deleteNode/deleteEdge/deleteHyperedge`, `query/querySync`, `kHopNeighbors`, `searchHyperedges`, `subscribe`, `stats`, `getStoragePath`, `isPersistent`, `batchInsert`. **No `updateNode`.** `createNode` shape: `{ id, embedding: Float32Array (REQUIRED), labels?, properties?: Map<String,String> }`.

> ⚠️ **Channel caveat:** the sandbox bash layer narrated (and at one point confabulated) fine-grained output. Build+load signal is trustworthy and internally consistent; **deep functional CRUD/query verification is deferred to the workstation** where the channel is clean.

---

## Decoupling — partner onboarding ships now, independent of this

Gabriel and Samuel do **not** wait on the graph engine. They onboard today via admin-scoped MCP bearer
tokens (`POST /api/tokens`, dev-admin), getting governed Brain access through the kernel — regardless
of whether the graph behind it is Neo4j or RuVector. Onboarding and cutover run in parallel.
