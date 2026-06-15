# PORT_STATUS.md — Dashboard Page Inventory

**Generated:** 2026-06-15 | **Goal:** goal-20260615-0550

## Summary

19 dashboard pages exist. **15 are LIVE** (hitting PostgreSQL directly via server components). 2 use client-side fetch to REST API routes. 2 are redirects. **No pages call Brain MCP remotely** — they use in-process canonical tools.

Design tokens are **already cool-toned** (Figma Make palette). IBM Plex Sans font is active.

## Page Inventory

| Page | Route | Data Source | Status |
|------|-------|-------------|--------|
| Dashboard root | `/dashboard` | — | REDIRECT → mission-control |
| Mission Control | `/dashboard/mission-control` | PG (process_runs, work_items, events) | LIVE |
| Search | `/dashboard/search` | PG + Neo4j (hybrid RRF) | LIVE (client + server action) |
| Knowledge Graph | `/dashboard/graph` | Neo4j + PG fallback | LIVE (client-side fetch) |
| Runs | `/dashboard/runs` | PG (process_runs) | LIVE |
| Run Detail | `/dashboard/runs/[id]` | PG | LIVE |
| Projects | `/dashboard/projects` | PG (projects, work_items) | LIVE |
| Project Detail | `/dashboard/projects/[id]` | PG | LIVE |
| Work Board | `/dashboard/work-board` | PG (work_items by status) | LIVE |
| Execution | `/dashboard/execution` | PG (feature-gated) | LIVE |
| Approvals | `/dashboard/approvals` | PG (curator_proposals, events) | LIVE |
| Evidence | `/dashboard/evidence` | PG (evidence_packets) | LIVE |
| Handoffs | `/dashboard/handoffs` | PG (handoffs) | LIVE |
| Dreams | `/dashboard/dreams` | PG (canonical_proposals, events) | LIVE |
| Scheduled Tasks | `/dashboard/scheduled-tasks` | PG (watchdog heartbeat) | LIVE |
| Teams | `/dashboard/teams` | PG (operational-state) | LIVE |
| Settings | `/dashboard/settings` | PG (health checks) | LIVE |
| Governance | `/dashboard/governance` | — | REDIRECT → approvals |
| Kanban | `/dashboard/kanban` | — | REDIRECT → work-board |

## Data Fetching Pattern

All operational pages use:
```tsx
export const dynamic = "force-dynamic"
async function loadData() {
  const pool = getPool()
  const result = await pool.query<Row>(SQL, [GROUP_ID])
  return result.rows
}
```

Search + Graph use client-side fetch to `/api/memory/*` REST routes.

## API Routes (all in-process, no remote MCP)

| Route | MCP Tool | Status |
|-------|----------|--------|
| `/api/memory` | memory_add, memory_list, memory_search | EXISTS |
| `/api/memory/[id]` | memory_get, memory_delete | EXISTS |
| `/api/memory/graph` | Neo4j graph query | EXISTS |
| `/api/memory/insights` | Neo4j insights | EXISTS |
| `/api/execution-overview` | PG process_runs | EXISTS |
| `/api/runs/*` | PG process engine | EXISTS |
| `/api/curator/*` | PG curator_proposals | EXISTS |
| `/api/health/*` | PG + Neo4j health | EXISTS |
| `/api/stream` | SSE health polling | EXISTS |

## Design Token Status

| Aspect | Status |
|--------|--------|
| Core palette (cool-toned) | ✅ Already Figma Make values |
| IBM Plex Sans font | ✅ Active |
| Dark mode | ⚠️ Partial (10 tokens, 5 components) |
| Agent accent colors | ✅ 7 agents defined |

## What's Missing (from Figma Make design)

Pages in Figma Make NOT yet in the dashboard:
1. **NewChatPage** — greeting + chat input + agent selector grid (agent runtime UI)
2. **Agents tab** — agent cards with avatar, tools list, run count, status

Both require NanoClaw/agent runtime integration — **deferred per roundtable verdict**.
