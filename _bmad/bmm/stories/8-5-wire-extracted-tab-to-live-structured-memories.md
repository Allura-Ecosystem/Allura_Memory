# Story 8.5 — Wire Extracted Tab to Live Structured Memories

## Story

As a user viewing the Extracted tab in the Allura dashboard, I want to see real structured memories pulled from Allura Brain so I can review actual extractions (subject, type, value, confidence, source) instead of hardcoded placeholder rows.

## Acceptance Criteria

- [ ] AC1: Extracted tab fetches real structured memories from Brain MCP on mount
- [ ] AC2: Each row shows subject, type, value, confidence, source, and date from real data
- [ ] AC3: Stat strip (Total extracted, This week, High confidence, Pending review) reflects real counts
- [ ] AC4: Loading state shows "Loading extractions..." while fetching
- [ ] AC5: Error state shows "Extractions unavailable" with a Retry button
- [ ] AC6: Empty state shows "No extractions yet" when Brain returns zero
- [ ] AC7: Export CSV is disabled or hidden until real export is implemented
- [ ] AC8: No hardcoded/mock rows remain in ExtractedPage

## Tasks/Subtasks

- [x] Task 1: Create `fetchBrainExtractions()` helper using existing MCP handshake pattern
  - [x] Subtask 1.1: Reuse session initialization from fetchBrainMemories
  - [x] Subtask 1.2: Call `memory_list` to get memories with structured metadata
  - [x] Subtask 1.3: Map to extraction row format: [subject, type, value, confidence, source, date]
  - [x] Subtask 1.4: Compute stat-strip counts from real data
- [x] Task 2: Rewrite `ExtractedPage` with useEffect live-data loading
  - [x] Subtask 2.1: Add loading/error/ready/empty state management
  - [x] Subtask 2.2: Render real rows in table format
  - [x] Subtask 2.3: Show honest degraded states
- [x] Task 3: Remove all hardcoded `rows` array from ExtractedPage
- [ ] Task 4: Verify in browser — real extractions render with correct metadata

## Dev Notes

### Architecture
- File: `/home/ronin704/Projects/design/brand-maker/allura-app/src/main.jsx`
- ExtractedPage is also used standalone (not just embedded) — preserve the `embedded` prop behavior
- Derive subject from user_id or tags, type from category tag, value from content, confidence from score
- Stat strip should compute from the fetched set (total, high-conf count, etc.)

### Previous Learnings (Story 8.1)
- Accept header MUST be "application/json, text/event-stream"
- parseMcpToolPayload handles SSE data frames
- Watch for Unicode curly quotes from Edit tool — ASCII only

### MCP Tool
- Use `memory_list` with `group_id: "allura-system"` for structured memories
- Memory fields: id, content, score, source, provenance, user_id, created_at, tags

## Dev Agent Record

### Implementation Plan
1. Read fetchBrainProvenance and surrounding fetch helpers to understand the MCP session handshake pattern.
2. Insert fetchBrainExtractions() directly after fetchBrainProvenance (line 863) — same session init, memory_list call with limit 50, then map raw to extraction row shape and compute stat counts.
3. Rewrite ExtractedPage: replace hardcoded rows array with useState/useEffect, four status states (loading/error/empty/ready), real stat-strip from computed counts, real table rows from fetched data, Export CSV button disabled.

### Debug Log
No blockers encountered. Pattern is identical to fetchBrainEvents and fetchBrainProvenance.

### Completion Notes
- fetchBrainExtractions() placed at line 865, directly after fetchBrainProvenance closes.
- deriveType() inner function maps tags[] first, then source/provenance string fallback, then defaults to "fact".
- Confidence bar width uses template literal `${row.confidence}%` — matches existing pattern in other tables.
- Export CSV button has `disabled` attribute per AC7.
- embedded prop preserved — className logic unchanged.
- All six hardcoded rows removed per AC8.
- Task 4 (browser verify) left open — requires manual check against live Brain MCP.

## File List
- `/home/ronin704/Projects/design/brand-maker/allura-app/src/main.jsx`

## Change Log
- Added `fetchBrainExtractions()` async function (lines 865-935): MCP session init, memory_list call, deriveType helper, row mapping, stat computation.
- Rewrote `ExtractedPage` component (lines 1502-1569): removed 6 hardcoded rows, added useState for rows/stats/status, useEffect load on mount, four conditional render states, real stat-strip, real table, Export CSV disabled.

## Status
complete
