# Allura Health & Observability

## Trigger
"check allura health", "system status", "memory system health", "queue depth", "how's the pipeline"

## Required Inputs
| Input | Type | Required | Description |
|-------|------|----------|-------------|
| `group_id` | string | **YES** | Tenant namespace (must match `^allura-*`). No calls without it. |

## MCP Tool Allowlist
- `allura-brain__memory_search` — verify retrieval path is functional
- `MCP_DOCKER__execute_sql` — query PostgreSQL for queue depth, latency metrics, event counts, and RuVector / semantic-layer probes (e.g. `SELECT count(*) FROM graph_memories WHERE group_id = $1`)

## Output Contract
```json
{
  "postgres": {
    "status": "healthy | degraded | unavailable",
    "latency_ms": "number — p50 query latency"
  },
  "ruvector": {
    "status": "healthy | degraded | unavailable",
    "latency_ms": "number — p50 query latency"
  },
  "queue": {
    "pending_count": "number — proposals awaiting curator action",
    "oldest_age_hours": "number — hours since oldest pending proposal"
  },
  "degraded": "boolean — true if any subsystem is degraded or unavailable"
}
```

## Guardrails
- **Read-only diagnostics.** This skill must NEVER create, update, or delete any data.
- **group_id required.** Every call must include group_id. Reject if missing.
- **No secrets in output.** Never expose connection strings, passwords, or internal IPs in the health report.
- **Timeout tolerance.** If a subsystem doesn't respond within 5 seconds, mark it `unavailable` — do not hang or retry.
- **No raw SQL writes.** `execute_sql` must only run SELECT queries. If any mutation query is detected, reject it.
- **Aggregate counts only.** Queue depth is a count, not a list of proposal contents. Do not expose PII from pending proposals.

## Health Check Procedure
1. Run `allura-brain__memory_search` with a trivial query to verify PostgreSQL + RuVector retrieval
2. Query `SELECT count(*) FROM canonical_proposals WHERE status='pending'` for queue depth
3. Query `SELECT EXTRACT(EPOCH FROM (now() - min(created_at)))/3600 as oldest_hours FROM canonical_proposals WHERE status='pending'` for age
4. Aggregate into the output contract and return