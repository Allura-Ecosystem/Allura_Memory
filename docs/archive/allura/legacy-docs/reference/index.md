# Reference Documentation

> Technical reference for Allura Memory — tools, APIs, and concepts.

## Sections

- **[MCP Tools](mcp-tools.md)** — Complete reference for all memory operations
- **[API Reference](api.md)** — HTTP endpoints and response formats
- **[Glossary](glossary.md)** — Terms and concepts used across Allura

## Quick Reference

### Memory Operations

| Operation | Tool | Purpose |
|-----------|------|---------|
| Store | `memory_add` | Write new memory to episodic layer |
| Search | `memory_search` | Hybrid semantic + fulltext retrieval |
| Retrieve | `memory_get` | Get single memory by ID |
| List | `memory_list` | List all memories for user/tenant |
| Update | `memory_update` | Versioned update (creates SUPERSEDES chain) |
| Delete | `memory_delete` | Soft-delete with 30-day recovery |
| Restore | `memory_restore` | Recover soft-deleted memory |
| Promote | `memory_promote` | Request curator promotion |
| Export | `memory_export` | Export filtered memories |
| List Deleted | `memory_list_deleted` | List recoverable memories |

### Required Parameters

Every operation requires:
- `group_id` — tenant namespace (`^allura-[a-z0-9-]+$`)
- `user_id` — user identifier (for user-scoped operations)

### Stores

| Store | Technology | Role | Write Pattern |
|-------|-----------|------|---------------|
| Episodic | PostgreSQL 16 + pgvector | Raw events, audit trail | Append-only |
| Semantic | Neo4j 5.26 | Curated knowledge graph | SUPERSEDES versioning |

### Key Concepts

| Term | Definition |
|------|------------|
| **Episodic memory** | Raw event capture in PostgreSQL — immutable, append-only |
| **Semantic memory** | Curated knowledge in Neo4j — versioned, relationship-rich |
| **Promotion** | Moving a memory from episodic to semantic after review |
| **Curator** | Human reviewer who approves/rejects promotion proposals |
| **SUPERSEDES** | Neo4j relationship linking new version to old version |
| **group_id** | Tenant isolation boundary — schema-enforced |
| **HITL** | Human-in-the-loop — required for canonical promotion |

---

*For user guides, see [`docs/user-guide/`](../user-guide/). For plugin docs, see [`docs/plugins/`](../plugins/). For canonical architecture, see [`docs/allura/BLUEPRINT.md`](../allura/BLUEPRINT.md).*
