# Allura — Principal Engineer Case Study

## Problem Framing

Allura addresses a gap in AI agent infrastructure: agents generate vast amounts
of operational data, but most of it is lost between sessions. Existing memory
systems either store everything (no governance) or require manual curation
(no automation). Allura introduces a human-in-the-loop promotion gate that
balances automation speed with human accountability.

## Standards

- **PostgreSQL-only architecture**: no proprietary graph database dependency
- **HITL governance**: 25 policies across 5 families enforce tenant isolation,
  audit immutability, promotion gates, and evaluation thresholds
- **Atomic promotion**: one PostgreSQL transaction for canonical memory,
  proposal transition, audit event, and projection outbox

## Rejected Alternatives

1. **Neo4j as semantic store** — rejected due to RAM cost on 4GB laptops and
   vendor lock-in. PostgreSQL pgvector provides equivalent HNSW + BM25 search.
2. **Auto-promotion without HITL** — rejected because compliance claims
   (halal, USDA, HACCP) carry legal liability and must always be human-approved.
3. **Token-level tenant isolation** — rejected for small teams; group_id
   server-side enforcement is sufficient and simpler.

## Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| PostgreSQL-only | Lower cost, simpler ops, but no native graph traversal |
| HITL promotion | Slower knowledge promotion, but accountable |
| Single MCP token | Simpler auth, but no per-tenant token isolation |
| Scenario harness (not live models) | Deterministic but doesn't test model behavior |

## Failure Modes

- **Budget exhaustion**: circuit breaker halts memory operations
- **RLS misconfiguration**: tenant data leak (mitigated by E2E tests)
- **Trigger + service conflict**: duplicate audit events (mitigated by trigger suppression)
- **Idempotency key collision**: replay returns wrong result (mitigated by unique constraint)

## Migration Strategy

Allura migrated from Neo4j to PostgreSQL-only in Epic 19 (2026-07-17).
The migration exported 4,235 nodes and 2,206 relationships to PostgreSQL
`graph_memories` and `graph_supersedes` tables. The process was:
1. Dual-read validation (Story 19.2)
2. Flip default to ruvector (Story 19.3)
3. Neo4j sunset (Epic 23)

## Developer Experience

- `allura init` → `allura up` → `allura doctor` → `allura run`
- One-command evaluation: `allura eval`
- Deterministic replay: `allura replay scenario.json receipt.json`
- No external credentials needed for simulation mode

## Measured Evidence

- 1,785 unit tests passing
- 150 E2E tests passing against live PostgreSQL
- 17 scenario harness tests passing
- 8 evaluation gate tests passing
- Branch protection enforced on main
- Controlled-red PR proved the gate blocks merges