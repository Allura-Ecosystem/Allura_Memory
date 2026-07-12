# Vendored Native Addon — ruvector-graph-node

## Purpose

This directory contains the pre-built `ruvector-graph-node` native N-API addon for the ruvector-crate graph adapter.

## Current Artifact

| File | Platform | SHA256 (placeholder) |
|------|----------|----------------------|
| `ruvector-graph-node.x86_64-unknown-linux-gnu.node` | Linux x86_64 | `sha256:placeholder` |

## Build & Regenerate

If breaking changes require rebuilding:

```bash
# 1. Clone and build the Rust crate (from ruvnet/ruvector-graph-node)
cd vendor/ruvector-graph-node
cargo build --release

# 2. Copy the artifact to this directory (naming convention: platform-specific)
cp target/release/libruvector_graph_node.so ../allura-memory/src/lib/graph-adapter/vendor/ruvector-graph-node.x86_64-unknown-linux-gnu.node
```

## Usage

The adapter loads this artifact at runtime via `require()` in `factory.ts`:

```ts
const modulePath = process.env.RUVECTOR_GRAPH_NODE_PATH ?? "./src/lib/graph-adapter/vendor/ruvector-graph-node.x86_64-unknown-linux-gnu.node"
const binding = require(modulePath) as NativeBinding
```

## Governance

- **G4-1** No third-party download — artifact only from trusted build machine
- **G4-2** Hash verification (future enhancement)
- **G4-6** `GRAPH_BACKEND=ruvector-crate` remains opt-in only (never default)

See `docs/archive/allura/AD-50-vendoring-native-addon.md`.

## Status

**Story 19.4:** Vendoring policy drafted (AD-50). Pre-built artifact required for real-binding (workstation-gated).
