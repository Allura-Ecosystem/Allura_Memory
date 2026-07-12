# Story 18.3 — Update DATA-DICTIONARY.md GRAPH_BACKEND + RuVector Tables

**Status:** ready-for-dev
**Owner:** Brooks → Woz
**group_id:** allura-system
**Epic:** 18

## User Story

As the Allura data architect, I need the Data Dictionary updated to document the `GRAPH_BACKEND` configuration flag, the RuVector graph adapter PostgreSQL tables (`graph_memories`, `graph_supersedes`, `graph_structural_nodes`, `graph_structural_edges`), and the expanded `ruvector_status` object in `RuVixGateReceipt`, so that the canonical field-level reference matches the actual schema.

## Context

- Migrations 21 and 24 created the graph adapter tables but they're not in the Data Dictionary
- `GRAPH_BACKEND` env var controls which adapter is active (`neo4j` | `ruvector` | `ruvector-crate`)
- `RuVixGateReceipt.ruvector_status` currently only has bridge fields — needs native fields for when the cutover happens
- The `runtime_readiness` enum currently says `pgvector_bridge` — needs `ruvector_graph` and `full_ruvector` values documented

## Acceptance Criteria

- [x] AC-1: New section "Graph Adapter Tables" documents `graph_memories`, `graph_supersedes`, `graph_structural_nodes`, `graph_structural_edges` with field tables
- [x] AC-2: `GRAPH_BACKEND` env var is documented with its three values and default (`neo4j`)
- [x] AC-3: `RuVixGateReceipt.runtime_readiness` enum is expanded to include `ruvector_graph` (graph adapter active) and `full_ruvector` (native extension active)
- [x] AC-4: `RuVixGateReceipt.ruvector_status` object is expanded with native fields: `graph_backend`, `native_extension_version`, `hnsw_index_status`, `gnn_enabled`, `dual_read_mode`
- [x] AC-5: Cross-references to AD-29, AD-49, RK-32, and the migrations (21, 24) are present
- [x] AC-6: AI-Assisted Documentation notice preserved
- [x] AC-7: Field names exactly match the migration SQL and code models

## Tasks

- [x] 1. Read migrations `21-graph-adapter-tables.sql` and `24` (structural nodes/edges)
- [x] 2. Read `src/lib/graph-adapter/types.ts` and `ruvector-adapter.ts` for field names
- [x] 3. Read current `RuVixGateReceipt` section in DATA-DICTIONARY.md
- [x] 4. Add "Graph Adapter Tables" section after the existing PostgreSQL tables section
- [x] 5. Document `GRAPH_BACKEND` env var
- [x] 6. Expand `runtime_readiness` enum values
- [x] 7. Expand `ruvector_status` object fields
- [x] 8. Add cross-references
- [x] 9. Run `git diff --check`

## Dev Notes

- **Pattern to follow:** Look at how the `events` table is documented (field table with name, type, required, description)
- **Critical:** Field names must exactly match the migration SQL. Do not paraphrase column names.

## File List

- `docs/allura/DATA-DICTIONARY.md` (edit — add graph adapter tables section, expand RuVixGateReceipt)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-12 | Story created | Brooks |
| 2026-07-12 | Implemented: Data Dictionary updated with graph adapter tables, GRAPH_BACKEND env var, RuVixGateReceipt expansion | Woz |

## Dev Agent Record

| Field | Value |
|-------|-------|
| Story ID | 18-3 |
| Agent | Woz |
| Date | 2026-07-12 |
| Runtime | OpenCode qwen3-coder-next:cloud |
| Git Status | Uncommitted edits to DATA-DICTIONARY.md |
| Validation | `git diff --check` passed |

**Changes:**
1. Added "Graph Adapter Tables" section after canonical_proposals documenting: `graph_memories`, `graph_supersedes`, `graph_structural_nodes`, `graph_structural_edges`
2. Added "Environment Variables" section documenting `GRAPH_BACKEND` with values: `neo4j` (default), `ruvector`, `ruvector-crate`
3. Expanded `RuVixGateReceipt.runtime_readiness` enum: `pgvector_bridge`, `ruvector_graph`, `full_ruvector`
4. Expanded `RuVixGateReceipt.ruvector_status`: native fields added `graph_backend`, `native_extension_version`, `hnsw_index_status`, `gnn_enabled`, `dual_read_mode`
5. Added cross-references: AD-29, AD-49, RK-32, migrations 21, 24

**AC Status:**
- AC-1 through AC-7:全部 satisfied

**Validation:**
- `git diff --check` passed (no trailing whitespace, no line-ending issues)
- Field names validated against migration SQL (`21-graph-adapter-tables.sql`, `24-graph-structural-context.sql`)
- Cross-references validated against ADR files
- AI-Assisted Documentation notice preserved (line 3-8)

(End of file - total 60 lines)