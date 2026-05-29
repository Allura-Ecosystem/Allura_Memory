# DESIGN-DASHBOARD.md — Allura Brain Dashboard Rebuild

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model (GitHub Copilot).
> Content has not yet been fully reviewed — this is a working design reference, not a final specification.
> AI-generated content may contain inaccuracies or omissions.
> When in doubt, defer to the source code, JSON schemas, and team consensus.

---

## Overview

The Allura Brain Dashboard is a **multi-agent memory governance surface** — a single pane of glass for managing memories, monitoring agent activity, and governing the promotion pipeline. It is inspired by Aion UI's information density and interaction patterns, adapted to Allura's dual-database (PostgreSQL + Neo4j) architecture.

**Primary user:** Ronin (operator/architect) managing memories and agents.

**One thing they come to do:** See what happened, govern what gets promoted, search what matters.

---

## Design Principles

1. **Conceptual Integrity** — One dashboard, one mental model. Memory is episodic (PG) or semantic (Neo4j). Agents write events. Curators promote. That's the loop.
2. **Honest Panels** — Every panel shows real data or explicitly says "unavailable." No skeleton theater, no fake numbers.
3. **Multi-Agent Native** — Nano Claw, Claude, OpenCode, Codex, Hermes, Brooks all write to the same `events` table with their `agent_id`. The dashboard reads, never writes.
4. **Aion-Inspired, Not Aion-Copied** — We borrow Aion's information density, timeline patterns, and agent-badging. We do not borrow Aion's backend assumptions.

---

## Phase 1 Scope: Memory + Agent Feed + Search

### Surfaces (Phase 1)

| Surface | Purpose | Data Source |
|---------|---------|-------------|
| **Memory Timeline** | Chronological view of all episodic memories (PG events) | `events` table WHERE `event_type = 'memory_add'` |
| **Agent Activity Feed** | Real-time stream of what each agent did | `events` table, grouped by `agent_id` |
| **Search** | Full-text and semantic search across memories | RuVector hybrid search (`retrieveMemories`) |
| **Stats Bar** | Episodic count, semantic count, search count, last activity | `/api/memory/stats` |

### Surfaces (Phase 2 — deferred)

| Surface | Purpose | Why Deferred |
|---------|---------|--------------|
| **Knowledge Graph** | Visual Neo4j graph | Requires ForceGraph2D integration; complex rendering |
| **Governance Queue** | Curator promotion pipeline | Requires curator UI workflow; separate concern |
| **Settings** | Theme, group_id, user preferences | Low priority; current defaults work |

---

## Functional Requirements

### F1: Memory Timeline

| ID | Requirement | Maps To |
|----|-------------|---------|
| F1.1 | Display episodic memories in reverse chronological order | B1 |
| F1.2 | Show memory content, agent_id, group_id, timestamp, score | B1 |
| F1.3 | Filter by agent_id (Nano Claw, Claude, OpenCode, Codex, Hermes, Brooks) | B2 |
| F1.4 | Filter by group_id | B2 |
| F1.5 | Paginate (20 per page, cursor-based) | B1 |
| F1.6 | Show degradation warnings when Neo4j is unavailable | B3 |

### F2: Agent Activity Feed

| ID | Requirement | Maps To |
|----|-------------|---------|
| F2.1 | Show recent events grouped by agent | B2 |
| F2.2 | Badge each agent with a distinct color/icon | B2 |
| F2.3 | Display event_type, content preview, timestamp | B2 |
| F2.4 | Filter by agent_id | B2 |
| F2.5 | Auto-refresh every 30 seconds (configurable) | B2 |

### F3: Search

| ID | Requirement | Maps To |
|----|-------------|---------|
| F3.1 | Full-text search across memory content | B3 |
| F3.2 | Semantic search via RuVector hybrid | B3 |
| F3.3 | Search mode toggle: text / vector / hybrid | B3 |
| F3.4 | Display results with relevance scores | B3 |
| F3.5 | Filter results by group_id and agent_id | B3 |

### F4: Stats Bar

| ID | Requirement | Maps To |
|----|-------------|---------|
| F4.1 | Show episodic_count, semantic_count, search_count | B1 |
| F4.2 | Show last_activity timestamp | B1 |
| F4.3 | Show degradation state when Neo4j is unavailable | B3 |
| F4.4 | Auto-refresh stats on interval | B1 |

---

## Business Requirements

| ID | Requirement |
|----|-------------|
| B1 | Operator can see all memories and their provenance at a glance |
| B2 | Operator can distinguish which agent did what, when |
| B3 | Operator can search memories and trust the results |

---

## Data Model

### Agent Badge Configuration

```typescript
interface AgentBadge {
  id: string;           // agent_id value in events table
  label: string;        // Display name
  color: string;        // Tailwind color class
  icon?: string;        // Optional icon name
}

const AGENT_BADGES: AgentBadge[] = [
  { id: 'brooks',  label: 'Brooks',  color: 'bg-blue-500',   icon: '🏗️' },
  { id: 'scout',   label: 'Scout',   color: 'bg-green-500',  icon: '🔍' },
  { id: 'woz',     label: 'Woz',     color: 'bg-purple-500', icon: '⚡' },
  { id: 'pike',    label: 'Pike',    color: 'bg-orange-500', icon: '👁️' },
  { id: 'fowler',  label: 'Fowler',  color: 'bg-yellow-500', icon: '🔄' },
  { id: 'codex',   label: 'Codex',   color: 'bg-pink-500',   icon: '🤖' },
  { id: 'claude',  label: 'Claude',  color: 'bg-amber-500',  icon: '🧠' },
  { id: 'hermes',  label: 'Hermes',  color: 'bg-cyan-500',   icon: '✉️' },
  { id: 'nano-claw', label: 'Nano Claw', color: 'bg-red-500', icon: '🦞' },
];
```

### Event Types for Activity Feed

```typescript
const EVENT_TYPES = [
  'memory_add',
  'memory_search',
  'memory_get',
  'memory_delete',
  'ARCHITECTURE_DECISION',
  'BLOCKER',
  'TASK_COMPLETE',
  'LESSON_LEARNED',
] as const;
```

---

## API Surface

### Existing (wired)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/memory/stats` | GET | Episodic/semantic/search counts |
| `/api/memory` | GET | List memories (with filters) |
| `/api/memory/search` | GET | Hybrid search |

### New (Phase 1)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/memory/activity` | GET | Recent events grouped by agent |
| `/api/memory/timeline` | GET | Paginated memory timeline |

---

## Component Architecture

```
src/app/(main)/allura/
├── page.tsx                    ← Main dashboard page
├── components/
│   ├── stats-bar.tsx           ← MetricCard row (episodic, semantic, searches)
│   ├── memory-timeline.tsx     ← Chronological memory list with filters
│   ├── agent-activity-feed.tsx ← Agent-badged event stream
│   ├── search-panel.tsx        ← Full-text + semantic search
│   ├── agent-badge.tsx         ← Reusable agent color/icon badge
│   └── degradation-banner.tsx  ← Neo4j unavailable warning
├── hooks/
│   ├── use-memory-stats.ts    ← SWR hook for /api/memory/stats
│   ├── use-activity-feed.ts   ← SWR hook for /api/memory/activity
│   └── use-memory-search.ts   ← SWR hook for /api/memory/search
└── types.ts                    ← Dashboard-specific types
```

---

## State Management

- **SWR** for data fetching (stale-while-revalidate, auto-refresh)
- **Zustand** for client-side UI state (active tab, filters, search mode)
- **Server Components** for initial data load (SSR)
- **Client Components** for interactive surfaces (timeline, feed, search)

---

## Routing

| Route | Surface | Auth |
|-------|---------|------|
| `/allura` | Dashboard home (stats + timeline) | `viewer` role |
| `/allura?tab=activity` | Agent activity feed | `viewer` role |
| `/allura?tab=search` | Search panel | `viewer` role |

---

## Important Constraints

1. **group_id enforcement** — Every API call must include `group_id`. The dashboard defaults to `allura-system` but allows switching.
2. **Degradation mode** — When Neo4j is unavailable, the dashboard must still function with PG-only data. Semantic count shows "—", graph features are hidden.
3. **Auth** — Clerk RBAC in production; `DevAuthProvider` fallback in dev. Role hierarchy: `admin > curator > viewer`.
4. **No direct DB writes from dashboard** — The dashboard reads only. All writes go through MCP tools or API routes with proper governance.
5. **Agent data comes from PostgreSQL events** — Each agent writes events with their `agent_id`. No new infrastructure needed.

---

## Bug Fix: `getNeo4jDriver` Mock Mismatch

**File:** `src/curator/approve-cli.test.ts`
**Bug:** Test mock exports `getNeo4jDriver` but the real module exports `getDriver`.
**Fix:** Changed mock from `{ getNeo4jDriver: vi.fn() }` to `{ getDriver: vi.fn().mockReturnValue({ session: vi.fn(), close: vi.fn() }) }`.
**ADR:** AD-030 — Mock names must match real module exports. When a mock replaces a module, every export the production code calls must be present in the mock.

---

## References

- [BLUEPRINT.md](./BLUEPRINT.md) — Service purpose and core concepts
- [DESIGN-ALLURA.md](./DESIGN-ALLURA.md) — Component-level design
- [DATA-DICTIONARY.md](./DATA-DICTIONARY.md) — Entity and field definitions
- [RISKS-AND-DECISIONS.md](./RISKS-AND-DECISIONS.md) — AD-030 (mock naming)
- `src/lib/dashboard/` — Existing dashboard query infrastructure
- `src/app/(main)/allura/page.tsx` — Current dashboard page