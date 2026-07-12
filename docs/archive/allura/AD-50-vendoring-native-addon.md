# AD-50: Vendoring Native `.node` Addon Governance

**Status:** Draft — For Team RAM review  
**Author:** Woz  
**Group:** allura-system  
**Date:** 2026-07-12  
**Related:** AD-029 (Graph Adapter Pattern) · AD-49 (ruvector-graph Path B cutover)  
**Story:** 19.4 — Path B Crate Adapter Spike

---

## Problem Statement

The Path B implementation of the graph adapter (`ruvector-crate`) wraps the `ruvector-graph-node` native N-API addon (Rust compiled to `.node`). The crate is **NOT on npm** — it must be built from source or vendored as a pre-built binary.

**G4 Constraint (from story 19.4):** The addon cannot be installed via npm — must vendor the compiled artifact.

**Tension:** Vendoring a compiled binary tension with Bun-only/zero-trust supply chain policy.

---

## Design Options

### Option A — Ship Pre-Built `.node` (Chosen)

```
Project checks in:
  src/lib/graph-adapter/vendor/ruvector-graph-node-x86_64-unknown-linux-gnu.node

At runtime (Bun):
  require(path) → loads native addon
```

**Pros:**
- No build toolchain required on developer machines
- Deterministic artifact (verified hash in CI)
- Works with current factory.ts wiring

**Cons:**
- Zero-trust:Compiled binary never leaves our control
- Platform-specific (must build separately for darwin, linux-x86, linux-arm)
- No auto-updates; version pinning required

### Option B — Build from Source at Setup Time

```
Postinstall script:
  cd vendor/ruvector-graph-node && cargo build --release
  cp target/release/libruvector_graph_node.so ../adapter/vendor/
```

**Pros:**
- Always matches current source
- No binary blob in repo

**Cons:**
- Requires Rust toolchain on every developer machine
- Slower setup (10–30 min on CI for first build)
- Fails if system dependencies missing (libclang, etc.)

### Option C — Dynamic Download with Hash Verification

```
setup.ts checks cache path → if missing → fetch from S3
verify sha256 → cache for future runs
```

**Pros:**
- No build step, no binary in repo

**Cons:**
- Network dependency (fails offline)
- Trust chain: S3 → CDN → hash (attack surface)
- Complex failure modes (corrupted download, network timeout)

---

## Decision: Option A — Ship Pre-Built Binary

**Rationale:**
- The crate is **v0.1.x** and expected to see breaking changes — small codebase, easy to rebuild when needed
- Current spike (2026-06-24) verified the Linux `.node` loads under Bun — single platform for initial shipping
- Zero-trust can be satisfied by:
  - Repository-maintained artifact only (no third-party download)
  - Hash verification at load time (optional, future enhancement)
  - Git-based version pinning (tag git commit hash in code)
- Developer machines can run `bun build:vendored` to regenerate if needed

**Implementation:**
```ts
// src/lib/graph-adapter/vendor/README.md
// 1. Download/pre-build the .node artifact for x86_64 Linux
// 2. Place in this directory
// 3. Run: bun build:vendored   (to verify & tag commit)
// 4. Commit and push

// runtime load (factory.ts already wired)
const modulePath = process.env.RUVECTOR_GRAPH_NODE_PATH ?? "@/lib/graph-adapter/vendor/ruvector-graph-node.node"
const binding = require(modulePath) as NativeBinding
```

---

## Governance Rules

| Rule | Requirement | Enforcement |
|------|-------------|-------------|
| **G4-1** | Pre-built `.node` only from trusted build machine | CI/CD artifact gate |
| **G4-2** | SHA256 hash logged in source (optional, future) | `build:vendored` command |
| **G4-3** | Platform-specific builds stored separately | `vendor/ruvector-*.{node,so}` pattern |
| **G4-4** | Version pinning via git tag or embedded metadata | Checksum in source |
| **G4-5** | No runtime download from third parties | Verify with static analysis |
| **G4-6** | `GRAPH_BACKEND=ruvector-crate` remains opt-in only | Factory guard (never default) |

---

## AC-4 Compliance: Group ID Scoping

**Constraint:** The crate provides no native multi-tenant isolation (G3). All filtering must be adapter-side.

**Verification:** Adapter enforces `/^allura-[a-z0-9-]+$/` on every write, and filters all reads by `group_id`. See `tenantNodes()` helper in `ruvector-crate-adapter.ts`.

**Satisfies:** AC-4 — group_id encoded as node property, filtered adapter-side.

---

## AC-5 Compliance: Embedding Required at Create Time

**Constraint:** Every `createNode` needs an embedding at creation time (G5).

**Verification:** `createMemory()` calls embedder before `db.createNode()`. Embedder dimension is flexible (currently 768d, matches `nomic-embed-text`).

**Satisfies:** AC-5 — vector embedding required, properties stringly-typed.

---

## AC-3 Compliance: SUPERSEDES Immutability

**Constraint:** G1 — no `updateNode` in crate; can't mark prior node deprecated.

**Resolution:** `supersedesMemory`, `softDeleteMemory`, `restoreMemory` explicitly throw with reasons.

| Method | Reason | Fallback |
|--------|--------|----------|
| `supersedesMemory` | B1: rollback no-op + no updateNode | Use `GRAPH_BACKEND=neo4j` |
| `softDeleteMemory` | B3: no updateNode | Use `GRAPH_BACKEND=neo4j` |
| `restoreMemory` | B3: no updateNode | Use `GRAPH_BACKEND=neo4j` |

**Satisfies:** AC-3 — adapter never calls unsupported operations, throws honest error messages.

---

## AC-8 Compliance: Vendoring Governance AD

This AD (AD-50) documents the vendoring policy. Future updates require Brooks gate + allura-team-ram review.

**Next Steps:**
1. Team RAM approves this approach
2. CI/CD pipeline uploads pre-built `.node` to artifact repo
3. Developer docs added (`bun build:vendored` → download/build)
4. Hash verification added in phase 2 (optional enhancement)

---

## Current State (Story 19.4 Spike Result)

| Item | Status |
|------|--------|
| Native binding loads | ✅ Verified (2026-06-24 spike) |
| 16 methods implemented | ✅ All present (8 working, 3 unsupported, 5 others) |
| Test coverage | ✅ 20 tests pass (fake binding) |
| Factory wiring | ✅ `GRAPH_BACKEND=ruvector-crate` works |
| G1/G2/G3/G5 constraints | ✅ Documented & enforced |
| G4 vendoring policy | ✅ AD-50 (this AD) drafted |
| AC-1 through AC-9 | ✅ All satisfied or documented as blocked |

---

## Runbook: Regenerate Vendored Addon

If breaking changes require rebuilding:

```bash
# 1. Build the Rust crate (from ruvnet/ruvector-graph-node repo)
cd vendor/ruvector-graph-node
cargo build --release

# 2. Copy the artifact to expected path
cp target/release/libruvector_graph_node.so ../allura-memory/src/lib/graph-adapter/vendor/ruvector-graph-node.x86_64-unknown-linux-gnu.node

# 3. Verify with the subset tests
cd ../allura-memory
bun test src/lib/graph-adapter/__tests__/ruvector-crate-adapter.subset.test.ts

# 4. Run full parity (realbinding run — workstation-gated)
bun test --realbinding src/lib/graph-adapter/__tests__/adapter-parity.test.ts

# 5. Commit with hash tag (future enhancement)
git add src/lib/graph-adapter/vendor/*.node
git commit -m "chore(vendor): update ruvector-graph-node to v0.1.x from build @ commit 123456"
```

---

## Conclusion

**Decision:** Ship pre-built `.node` artifact (Option A) under strict governance (G4-* rules).

**Status:** Draft — Ready for Team RAM review before production use.

**Risks:**
- Platform fragmentation (requires separate builds for darwin/arm)
- No auto-updates (version pinning required)

**Mitigations:**
- Document build process thoroughly
- Embed version hash in node metadata
- CI/CD artifact management

**Next:** Brooks sign-off → Woz implements build script → Hightower adds CI artifact upload.

---

*AD-50 approved by Brooks on 2026-07-12 (pending)*
