# Reference

Reference material for methodology authors and operators.

## Core Contracts

### Memory Model
- **Episodic layer (PostgreSQL):** Append-only event traces. Every `allura-brain_memory_add` writes here first.
- **Semantic layer (Neo4j):** Curated, versioned knowledge nodes. SUPERSEDES relationships for evolution.
- **Governance (RuVix):** Promotion gating, policy enforcement, budget/circuit breakers.

### Tenant Model
- `group_id` is the hard namespace boundary.
- Pattern: `^allura-[a-z0-9]([a-z0-9-]*[a-z0-9])?$`
- Cross-tenant access is impossible by schema constraint.

### Agent Identity
- Every memory operation must include agent persona as `user_id`.
- Generic IDs like `system` or `default` are only for bootstrap entries.

### Tool Signatures
Full MCP tool reference: [docs/reference/mcp-tools.md](../../docs/reference/mcp-tools.md). Exact tool names vary by adapter; public docs use the stable operation names (`memory_add`, `memory_search`, etc.) while this repository's governed runtime also exposes `allura-brain_memory_*` aliases.

| Operation | Tool |
|-----------|------|
| Store | `allura-brain_memory_add` |
| Search | `allura-brain_memory_search` |
| Get | `allura-brain_memory_get` |
| List | `allura-brain_memory_list` |
| Update | `allura-brain_memory_update` |
| Delete | `allura-brain_memory_delete` |
| Promote | promotion queue / curator path when available |

### Canonical Docs
The 6 canonical documents in `docs/allura/`:

1. `BLUEPRINT.md`
2. `SOLUTION-ARCHITECTURE.md`
3. `DESIGN-ALLURA.md`
4. `REQUIREMENTS-MATRIX.md`
5. `RISKS-AND-DECISIONS.md`
6. `DATA-DICTIONARY.md`

### Invariants
- Every operation must include a tenant `group_id` matching the `allura-*` pattern. This repository uses `allura-system` internally; outside builders should choose their own tenant, such as `allura-myteam`.
- PostgreSQL events are append-only
- Neo4j nodes are immutable (SUPERSEDES for versioning)
- Scout before build. Skills before Ralph. Validation before done.
