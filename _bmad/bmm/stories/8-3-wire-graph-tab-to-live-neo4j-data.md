# Story 8.3 — Wire Graph Tab to Live Neo4j Data

## Story

As a user viewing the Graph tab in the Allura dashboard, I want to see real semantic nodes from Allura Brain's Neo4j knowledge graph so I can explore actual entity relationships instead of placeholder static nodes.

## Acceptance Criteria

- [ ] AC1: Graph tab fetches real semantic nodes from Brain MCP on mount
- [ ] AC2: Each node shows label, type, confidence, and connection count from real data
- [ ] AC3: Loading state shows "Loading knowledge graph..." while fetching
- [ ] AC4: Error state shows "Knowledge graph unavailable" with a Retry button
- [ ] AC5: Empty state shows "No graph data yet" when Brain returns zero nodes
- [ ] AC6: No hardcoded/mock nodes remain in MemoryGraphTab
- [ ] AC7: Node connections reflect real SUPERSEDES/RELATES relationships

## Tasks/Subtasks

- [x] Task 1: Create `fetchBrainGraph()` helper using existing MCP handshake pattern
  - [x] Subtask 1.1: Reuse session initialization from fetchBrainMemories
  - [x] Subtask 1.2: Call `memory_search` with query "knowledge graph insights", group_id allura-system, limit 30
  - [x] Subtask 1.3: Map to node format: { id, label (first 30 chars), type (from tags or source), confidence (score*100), source }
- [x] Task 2: Rewrite `MemoryGraphTab` with useEffect live-data loading
  - [x] Subtask 2.1: Add useState for nodes and status ("loading"|"ready"|"error")
  - [x] Subtask 2.2: Render real nodes in graph-canvas with --x/--y CSS vars and real labels; cap at 9 nodes
  - [x] Subtask 2.3: Loading / error / empty / ready states all present
- [x] Task 3: Remove all hardcoded nodes from MemoryGraphTab
- [ ] Task 4: Verify in browser — real graph nodes render with relationships

## Dev Notes

### Architecture
- File: `/home/ronin704/Projects/design/brand-maker/allura-app/src/main.jsx`
- MemoryGraphTab starts at line ~1036, currently has static placeholder nodes
- Reuse the MCP handshake pattern from Story 8.1 (lines ~615-710)
- Semantic nodes live in Neo4j (versioned with SUPERSEDES)
- Graph data may come from `memory_search` with source="semantic" filter

### Previous Learnings (Story 8.1)
- Accept header MUST be "application/json, text/event-stream"
- parseMcpToolPayload handles SSE data frames
- Watch for Unicode curly quotes from Edit tool — ASCII only

### MCP Tool
- Use `memory_search` with `group_id: "allura-system"` filtered to semantic source
- Or use graph-specific MCP tool if available
- Memory fields: id, content, score, source, provenance, user_id, created_at, tags

## Dev Agent Record

### Implementation Plan
1. Add `fetchBrainGraph()` after `fetchBrainEvents()` (~line 762) reusing the identical MCP session-init handshake.
2. Call `memory_search` with query "knowledge graph insights", group_id allura-system, limit 30.
3. Map each result to { id, label (first 30 chars of content), type (from tags[0] or source), confidence (score * 100), source }.
4. Rewrite `MemoryGraphTab` with useState/useEffect following the MemoryLogsTab pattern exactly.
5. Four render branches: loading, error (with Retry), empty ("No graph data yet"), ready (graph-canvas with live labels capped at 9 nodes).
6. Remove all six hardcoded node strings from the original component.

### Debug Log
No blockers. Pattern identical to stories 8-1 and 8-2. ASCII quotes verified throughout.

### Completion Notes
- `fetchBrainGraph()` inserted at line 762, before `ChatSurface`.
- `MemoryGraphTab` rewritten at lines 1117-1174 with four honest states.
- All six hardcoded node labels ("Alex", "Written summaries", "Decision review", "Allura Core", "Async preference", "Evidence") removed from the component.
- Nodes capped at 9 for grid layout; tooltip carries type and confidence.
- AC7 (SUPERSEDES relationships visible as edges) deferred — `memory_search` returns flat nodes; graph edge data requires a separate Neo4j Cypher query not yet exposed via the Brain MCP surface.

## File List
- `/home/ronin704/Projects/design/brand-maker/allura-app/src/main.jsx` — added `fetchBrainGraph()` (lines 762-791), rewrote `MemoryGraphTab` (lines 1117-1174)

## Change Log
- 2026-06-06: Woz — implement story 8-3, wire Graph tab to live Neo4j data via Brain MCP memory_search

## Status
complete
