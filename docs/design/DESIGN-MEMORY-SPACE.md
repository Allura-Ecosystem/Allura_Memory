# DESIGN-MEMORY-SPACE.md — Memory Graph Dashboard

> **Status:** PROPOSED (ready for implementation)
> **Author:** Troy Curator + Team RAM
> **Date:** 2026-05-18
> **Scope:** Interactive memory graph dashboard for Allura Memory
> **Target:** Port 3100 (canonical)

---

## 1. Purpose

Build an interactive **Memory Space** dashboard that visualizes Allura's dual-layer memory (PostgreSQL episodic + Neo4j semantic) as a navigable graph. Users explore relationships, inspect details, and act on memories without leaving the dashboard.

This is **not decorative eye candy**. The 3D concept serves information architecture first:
- **Layers** — episodic vs semantic distinction
- **Lanes** — status pipelines (raw → approved → promoted → deprecated)
- **Relationships** — supersedes, related, promoted_from, authored_by
- **Drilldowns** — from graph node to full detail panel
- **Status depth** — score, source, provenance, agent attribution

---

## 2. Port Model (Observed from Repo)

| Port | Role | Evidence | Status |
|------|------|----------|--------|
| **3100** | Canonical dashboard target | `package.json` scripts, `.env.example` `ALLURA_DASHBOARD_PORT=3100` | ✅ Confirmed |
| **3201** | MCP HTTP Gateway | `.env.example` `ALLURA_MCP_HTTP_PORT=3201` | ✅ Confirmed |
| **4310** | Dev preview / hot reload | Not found in repo — spec only | ⚠️ Spec only |
| **5888** | Claimed MCP gateway | Not found in repo config | ❌ **Discrepancy** — user claims 5888, repo shows 3201 |
| **3334** | Retired | Notion finish plan P0-06 | ❌ Do not use |
| **6420** | Reference only / visual mockup | Not in repo | ❌ Do not use for acceptance |

**Note:** Port 5888 was mentioned by user but does not appear in any config file observed. The actual MCP HTTP port per `.env.example` is **3201**. If 5888 is a custom override, it must be documented in `.env.local` (gitignored).

---

## 3. What Data Is Live

| Data Source | Backend | Live? | API Route |
|-------------|---------|-------|-----------|
| Memory list | PostgreSQL | ✅ | `GET /api/memory` |
| Memory search | PostgreSQL + pgvector | ✅ | `GET /api/memory/search` |
| Memory detail | PostgreSQL + Neo4j | ✅ | `GET /api/memory/:id` |
| Memory graph | Neo4j | ✅ | `GET /api/memory/graph` |
| Memory count | PG + Neo4j merged | ✅ | `GET /api/memory/count` |
| Curator proposals | PostgreSQL | ✅ | `GET /api/curator/proposals` |
| Audit events | PostgreSQL | ✅ | `GET /api/audit/events` |
| Health status | PG + Neo4j + services | ✅ | `GET /api/health` |
| Graph layout positions | **Not yet implemented** | ❌ | Needs new table/collection |
| Memory relationships per node | **Not yet implemented** | ❌ | Needs new route |

---

## 4. What Data Is Fallback

| Scenario | Fallback Behavior |
|----------|-------------------|
| Neo4j unavailable | Graph API returns 206 + Warning header, empty arrays |
| No memories found | Show empty state with "Nothing has been saved yet" |
| WebGL unavailable | Switch to 2D list/table view |
| No layout positions | Use Fibonacci sphere distribution for initial placement |
| Search returns 0 results | Show "No memories match your search" with clear-filter CTA |
| Auth fails | Redirect to sign-in (if Clerk enabled) or show 403 |

---

## 5. Interaction Model

### 5.1 Memory Explorer (Graph Canvas)
- **View**: 3D force-directed graph of memory nodes
- **Actions**: zoom, pan, orbit, click, drag, hover, search, filter
- **Node representation**: Canvas texture card (title + score + status ring)
- **Edge representation**: Curved lines with relationship labels

### 5.2 Memory Detail (Side Panel)
- **Trigger**: Click a node
- **Content**: Full text, metadata, provenance, score, relationships, actions
- **Actions**: Approve, Reject, Edit, Delete (soft), Restore
- **Dismiss**: Click outside, press Escape, or click ✕

### 5.3 Promotion Queue
- **Access**: Filter by type="raw" or status="pending"
- **Actions**: Bulk approve/reject from detail panel
- **Source**: Curator proposals API

### 5.4 Evidence Center
- **Content**: Audit trail for selected memory (who wrote it, when, why)
- **Source**: Audit events API filtered by memory_id

### 5.5 Runtime Health
- **Display**: Small badge in header (green/yellow/red)
- **Click**: Opens health detail panel with PG + Neo4j + MCP status
- **Source**: `/api/health/metrics`

### 5.6 Governance Gates
- **Display**: Count of pending promotions, rejected memories, deprecated nodes
- **Source**: Curator proposals + memory counts by status

---

## 6. Brooks / Woz / Pike Rules

### Brooks (Architecture)
- No accidental complexity — reuse existing `getGraph()`, `getMemoryList()`, `getHealth()` APIs
- Build on existing `(main)/dashboard/` layout and sidebar
- Do not introduce new state libraries — use existing Zustand stores
- Graph layout persistence is a separate concern from memory truth

### Woz (Usability)
- Every visible control must work against real data or be disabled with reason
- Search is live (debounced 250ms, matching existing feed behavior)
- Detail panel loads lazily — no blocking the graph
- Fallback to 2D list if WebGL fails
- Keyboard accessible: Tab to focus nodes, Enter to open detail

### Pike (Diagnostics)
- Environment badge always visible: `CANONICAL :3100` or `DEV PREVIEW :4310`
- Health badge shows actual status, not decorative green
- Error boundaries on graph canvas — fail gracefully to list view
- Every API error logged to console with `[MemoryCanvas]` prefix

---

## 7. Existing Routes (Confirmed)

| Route | File | Purpose |
|-------|------|---------|
| `/` | `src/app/page.tsx` | Redirects to `/dashboard/feed` |
| `/dashboard` | `src/app/(main)/dashboard/page.tsx` | Redirects to `/dashboard/feed` |
| `/dashboard/feed` | `src/app/(main)/dashboard/feed/page.tsx` | Memory feed with search + filters |
| `/dashboard/insights` | `src/app/(main)/dashboard/insights/page.tsx` | Insights/Decisions |
| `/dashboard/health` | `src/app/(main)/dashboard/health/page.tsx` | System health |
| `/dashboard/audit` | `src/app/(main)/dashboard/audit/page.tsx` | Audit trail |
| `/api/memory` | `src/app/api/memory/route.ts` | CRUD + search |
| `/api/memory/graph` | `src/app/api/memory/graph/route.ts` | Neo4j graph nodes + edges |
| `/api/memory/count` | `src/app/api/memory/count/route.ts` | Memory count |
| `/api/health` | `src/app/api/health/route.ts` | Health status |
| `/api/health/metrics` | *(observed in api.ts)* | Detailed metrics |

---

## 8. Missing Routes (To Create)

| Route | Method | Purpose | Backend |
|-------|--------|---------|---------|
| `/dashboard/memory-space` | GET | Main graph dashboard page | — (UI only) |
| `/api/memory/graph/layout` | GET/POST | Persist/load node positions | New table: `memory_layouts` |
| `/api/memory/relationships/:id` | GET | Get edges for a specific memory | Neo4j query |

---

## 9. File Plan (Exact)

### New Files
```
src/app/(main)/dashboard/memory-space/
├── page.tsx                    # Main graph page
├── layout.tsx                  # Memory space layout (no sidebar, full-screen)

src/components/memory-space/
├── MemoryCanvas.tsx            # React Three Fiber wrapper
├── MemoryGraphScene.tsx        # 3D scene with physics
├── MemoryNodeMesh.tsx          # Individual node (canvas texture)
├── MemoryEdgeLine.tsx          # Connection line
├── DetailPanel.tsx             # Side panel for memory actions
├── SearchBar.tsx               # Search + filter overlay
├── EnvironmentBadge.tsx        # CANONICAL / DEV badge
└── FallbackListView.tsx        # 2D list when WebGL unavailable

src/lib/memory-space/
├── types.ts                    # Node/Edge/Layout types
├── colors.ts                   # Status color mapping
├── textures.ts                 # Canvas texture generation
└── force-simulation.ts         # Physics engine

src/hooks/
└── use-memory-space.ts         # Fetch graph + layout + detail
```

### Modified Files
```
src/navigation/sidebar/sidebar-items.ts
  → Add "Memory Space" nav item

src/app/(main)/dashboard/layout.tsx
  → Add environment badge to header (optional)
```

---

## 10. API Dependencies

| API | Used By | Status |
|-----|---------|--------|
| `GET /api/memory/graph` | MemoryCanvas | ✅ Exists |
| `GET /api/memory` | DetailPanel (fallback list) | ✅ Exists |
| `GET /api/memory/:id` | DetailPanel | ✅ Exists |
| `DELETE /api/memory/:id` | DetailPanel | ✅ Exists |
| `GET /api/health` | EnvironmentBadge | ✅ Exists |
| `GET /api/memory/graph/layout` | MemoryCanvas (persist) | ❌ **Missing** |
| `POST /api/memory/graph/layout` | MemoryCanvas (save) | ❌ **Missing** |
| `GET /api/memory/relationships/:id` | DetailPanel | ❌ **Missing** |

---

## 11. Safe Fallbacks

| Failure | Fallback |
|---------|----------|
| WebGL not supported | Render `FallbackListView` (existing memory table) |
| Neo4j unavailable | Show warning badge, render nodes from PG only |
| Graph API 500 | Show error toast + retry button |
| Layout API missing | Use Fibonacci sphere for initial positions |
| Detail API 404 | Show "Memory not found" in panel |
| Auth 403 | Redirect to `/dashboard/feed` with error toast |

---

## 12. Tests / Smoke Checks

### Build-time
- [ ] `bun run typecheck` passes
- [ ] `bun run build` succeeds (no R3F tree-shaking issues)

### Runtime
- [ ] Dashboard loads at `http://localhost:3100/dashboard/memory-space`
- [ ] Graph renders 50+ nodes without crashing
- [ ] Click node → detail panel opens with real data
- [ ] Search filters nodes in real-time
- [ ] Drag moves nodes (positions not yet persisted = acceptable for v1)
- [ ] Badge shows `CANONICAL :3100`
- [ ] WebGL disabled → fallback list view appears

### API
- [ ] `GET /api/memory/graph?group_id=allura-system` returns nodes + edges
- [ ] `GET /api/memory/graph?stats=true` returns counts only
- [ ] Response includes `Warning` header when Neo4j degraded

---

## 13. Acceptance Criteria

- [ ] Route `/dashboard/memory-space` exists and is reachable
- [ ] Displays memory graph with 50+ nodes from live Neo4j data
- [ ] Clicking a node opens detail panel with full content + metadata
- [ ] Search input filters visible nodes
- [ ] Environment badge visible (CANONICAL :3100 on prod)
- [ ] All buttons work against real stack state (no fake buttons per Pike)
- [ ] WebGL fallback shows list view
- [ ] Accessibility: keyboard navigation, focus rings, reduced motion
- [ ] No new dependencies beyond existing `@react-three/fiber` and `three`

**Hard rule:** Acceptance only on port 3100. Dev preview (4310) is scaffolding, not evidence.

---

## 14. What Does Port 3100 Actually Serve?

**Evidence:**
- `package.json`: `"dev": "cross-env FORCE_COLOR=1 next dev --turbo -p ${ALLURA_DASHBOARD_PORT:-3100}"`
- `.env.example`: `ALLURA_DASHBOARD_PORT=3100`
- `docker-compose.yml`: `web` service exposes port 3100
- `src/lib/config/ports.ts`: `dashboard: { min: 3100, max: 3199, default: 3100 }`

**Conclusion:** Port 3100 serves the **Next.js Allura dashboard** — the canonical product UI. This is the only port that matters for acceptance.

---

## 15. What Can the User Click, Filter, Inspect, or Act On?

| Action | Target | Data Source |
|--------|--------|-------------|
| **Click** | Memory node | Opens detail panel |
| **Search** | Graph nodes | Filters by title/content/agent |
| **Filter** | By type/status | Toggle raw/approved/promoted/deprecated |
| **Inspect** | Full memory content | Detail panel with metadata + relationships |
| **Approve** | Raw memory → Promoted | Curator proposal API |
| **Delete** | Soft delete memory | `/api/memory/:id` DELETE |
| **Navigate** | Related memories | Click edge target |
| **Zoom** | Camera in/out | Mouse wheel / pinch |
| **Pan** | Camera orbit | Right-click drag |

---

## 16. Evidence Proving Rebuild Is Safe

| Evidence | Source |
|----------|--------|
| Graph API already returns nodes + edges | `src/app/api/memory/graph/route.ts` |
| Dashboard layout with sidebar exists | `src/app/(main)/dashboard/layout.tsx` |
| Memory CRUD API exists | `src/app/api/memory/route.ts` |
| Health API exists | `src/app/api/health/route.ts` |
| Zustand stores exist | `src/stores/search/`, `src/stores/node/` |
| Existing memory types | `src/lib/dashboard/types.ts` |
| Port 3100 confirmed canonical | `package.json`, `.env.example`, `ports.ts` |

**Risk:** Missing layout persistence API. Mitigation: Use in-memory positions for v1, add persistence in v2.

---

## 17. Out of Scope

- Real-time collaboration (multiple users)
- Edge creation (drag to connect memories)
- Board mode (Kanban columns)
- Focus mode (single memory centered)
- Memory versioning visualization
- Export graph as image
- Graph layout persistence (deferred to v2)

---

*End of DESIGN-MEMORY-SPACE.md*
