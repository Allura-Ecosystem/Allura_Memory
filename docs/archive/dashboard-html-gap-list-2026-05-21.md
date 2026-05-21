# HTML Dashboard Gap List — 2026-05-21

**Purpose:** Record which sections of `dashboard/mission-control.html` (port 6420) have no
Next.js equivalent yet, for Phase 4 cutover planning input.

**Source:** Jobs intent brief, session 2026-05-21. Route stabilization sprint.

**Note:** The HTML dashboard is a static SPA with hardcoded data — every number is a
literal string. The Next.js routes already exceed it on live data. This gap list
is for completeness, not for 1:1 porting.

---

## Ported (Next.js routes already cover this)

| HTML Section | Next.js Route | Notes |
|---|---|---|
| Memory System / graph | `/dashboard/memory-space` | Live Neo4j 2D force graph, search, filters, detail panel |
| Active Agents | `/dashboard/agents` | Live graph node query, agent cards, confidence metrics |
| Insights / Governance | `/dashboard/insights` | HITL approve/reject, curator queue tabs |
| Insight Builder | `/dashboard/builder` | Compose form + curator queue with approve/reject |
| Board Switcher | `/dashboard` | Board registry, status model, source-of-truth badges |
| Allura Brain / Mission Control | `/allura` | Memories, insights, trace logs, provenance, approval queue |

---

## Not Ported — No Next.js Equivalent

| HTML Section | Phase | Blocker |
|---|---|---|
| Memory Stats panel (total count, search count, episodic/semantic split) | Phase 4 | Needs `/api/memory/stats` endpoint (does not exist) |
| Projects Kanban | Phase 5 | Domain board — needs board config + private config approval |
| Model Performance panel | Phase 5 | No live data source; metrics not captured in current schema |
| Skill Performance panel | Phase 5 | No live data source; skill invocation not instrumented |
| Prompt Performance panel | Phase 5 | No live data source; prompt telemetry not captured |
| Recent Activity feed | Phase 4 | Needs audit log query surface or events-table read endpoint |
| Quick Links | Phase 4 | Static nav — trivial but not a cutover gate |

---

## Decision Record

- **1:1 HTML port is off the table.** HTML dashboard has zero live data (all hardcoded).
  Next.js routes already exceed it. Confirmed by Jobs + Troy Curator, 2026-05-21.
- **6420 is visual direction** (warm cream, search-first, no dark shell), not a source to port.
- **Phase 4 cutover** requires Memory Stats and Recent Activity to be filled before
  the HTML → Next.js cutover on port 3100 can be completed.
- **Phase 5** requires domain board governance approval before Kanban and performance
  panels can be built.

---

## Next Actions (Phase 4 input)

1. Add `/api/memory/stats` endpoint — aggregate counts from PostgreSQL + Neo4j
2. Wire Recent Activity from existing `events` table (PostgreSQL, append-only)
3. Add Memory Stats panel to `/dashboard` or `/allura` using new endpoint
4. Quick Links — static nav component, low priority
