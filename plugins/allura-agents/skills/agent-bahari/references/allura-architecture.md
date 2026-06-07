---
name: allura-architecture
description: System knowledge reference — Allura's dual-database architecture, invariants, and curator pipeline
---

# Allura Architecture

Allura is a sovereign AI memory engine — a self-hosted, governed alternative to mem0. It gives AI agents persistent, auditable, multi-tenant memory.

## Dual-Database Architecture

| Layer | Store | Purpose | Invariant |
|-------|-------|---------|-----------|
| **Episodic** | PostgreSQL 16 | Raw event traces — every action ever taken | Append-only. Never UPDATE or DELETE. |
| **Semantic** | Neo4j 5.26 | Curated knowledge — patterns, decisions, insights | Immutable nodes. Updates use `SUPERSEDES`. |

### How Memory Flows

```
memory_add(content, userId)
    ↓
PostgreSQL (episodic trace — always stored here first)
    ↓
Score (0.0–1.0 confidence)
    ↓
  < 0.85 → stays episodic (raw trace)
  ≥ 0.85 → enters curator pipeline
    ↓
Curator Pipeline:
  soc2 mode → proposal queued for human approval
  auto mode → promoted directly to Neo4j
    ↓
Neo4j (semantic knowledge — versioned, immutable)
```

## Six Non-Negotiable Invariants

1. **`group_id` on every operation** — pattern `^allura-[a-z0-9-]+$`. Missing it causes CHECK constraint failure.
2. **PostgreSQL is append-only** — no UPDATE/DELETE on event rows, ever.
3. **Neo4j uses SUPERSEDES** — `(v2)-[:SUPERSEDES]->(v1:deprecated)`, never edit existing nodes.
4. **HITL required for promotion** — agents cannot autonomously promote to Neo4j in soc2 mode.
5. **DB operations via MCP tools only** — never `docker exec`.
6. **`allura-*` tenant namespace only** — only the canonical `allura-` prefix is valid. Flag any other prefix as drift.

## Tenant Model

`group_id` is the hard isolation boundary. Every read and write MUST include a valid `group_id`. Enforced by a PostgreSQL CHECK constraint (`group_id ~ '^allura-'`). No application-layer bypass is possible.

When helping users, use THEIR `group_id` — not `allura-system` (that's for internal agents).

## Curator Pipeline

### Promotion Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `soc2` | Score ≥ threshold → queued for human approval | Production, compliance |
| `auto` | Score ≥ `AUTO_APPROVAL_THRESHOLD` (default 0.85) → immediate promotion | Development, personal use |

### Proposal Lifecycle

```
pending → approved → promoted to Neo4j
       → rejected → retained for audit (never deleted)
```

Each proposal carries: content, score, reasoning, tier (emerging/adoption/mainstream), trace reference.

### Tiers

| Tier | Confidence | Meaning |
|------|-----------|---------|
| `emerging` | 0.0–0.5 | Needs more evidence |
| `adoption` | 0.5–0.75 | Worth tracking |
| `mainstream` | 0.75–1.0 | Strong signal, ready for promotion |

## Neo4j Knowledge Graph

### Node Types

- **Memory** — core knowledge unit (`id`, `content`, `score`, `group_id`, `deprecated`)
- **Agent** — agent identity (`confidence`, `contributions`)
- **Team** — team grouping
- **Project** — project scope

### Key Relationships

- `SUPERSEDES` — version chain (`v2 → v1`)
- `AUTHORED_BY` — agent attribution
- `CONTRIBUTES_TO` — project membership

### Query Rules

- Always filter `m.deprecated = false` for current knowledge
- Always filter by `group_id`
- Use parameterized queries only

## Soft-Delete and Recovery

- `memory_delete` appends a deletion event — never hard-deletes data
- 30-day recovery window via `memory_restore`
- Deleted memories are excluded from search results but preserved in audit trail

## Governance Receipts

Every mutation produces a `GovernanceReceipt`:

| Field | Purpose |
|-------|---------|
| `receipt_id` | Stable identifier |
| `intent` | Why the action was taken |
| `actor_id` | Who requested it |
| `group_id` | Tenant scope |
| `source_refs` | Evidence used |
| `policy_refs` | Rules evaluated |
| `result` | approved, rejected, soft_deleted, recovered, blocked |
| `gate_decision` | Permit, Defer, or Deny |
