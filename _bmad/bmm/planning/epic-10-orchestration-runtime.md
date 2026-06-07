# Epic 10 — Orchestration & Runtime

> **Status:** Backlog (blocked by Epic 9)
> **Date:** 2026-06-06
> **Roadmap Steps:** 4–7
> **Goal:** Add the runtime features that make Allura an active agent — task orchestration, background automation, and conversational interface
> **Prerequisite:** Epic 9 complete (truthfulness infrastructure in place, DoD tests passing)

---

## Story 10.1 — Notion Symphony Adapter

**Title:** Implement NotionTaskSource adapter for Symphony orchestration via MCP_DOCKER Notion tools
**Priority:** P1-High | **Complexity:** Medium | **Agent:** Woz
**Roadmap Step:** 4

**Description:**
Implement the `NotionTaskSource` adapter specified in `symphony-notion-adapter-spec.md` (relocated alongside this epic in `_bmad/bmm/planning/`). The adapter translates between Notion's API (via MCP_DOCKER tools) and Symphony's task lifecycle model. Includes the 60s polling loop and Brooks routing logic.

**Implementation Files:**
- `src/integrations/symphony/notion-task-source.ts` — adapter implementation
- `src/integrations/symphony/orchestrator.ts` — polling loop + agent spawn
- `src/integrations/symphony/types.ts` — `SymphonyTask`, `ProofOfWork`, `TaskStatus` types

**Core Methods:**

| Method | MCP Tool | Operation |
|---|---|---|
| `getNextTask()` | `notion-query-database-view` | Filter: Status = "Ready", Sort: Priority ASC |
| `claimTask()` | `notion-update-page` | Set Agent, Status → "In Progress", Session ID |
| `updateStatus()` | `notion-update-page` | Set Status property |
| `submitProof()` | `notion-update-page` | Set PR URL, CI Status, Proof Summary, Brain Receipt |
| `listByStatus()` | `notion-query-database-view` | Filter by Status value |

**Acceptance Criteria:**
- [ ] `NotionTaskSource` implements all 5 interface methods
- [ ] Polling loop runs at 60s interval, picks up Ready tasks
- [ ] Brooks routing logic selects agent based on title keywords (per spec Section 3)
- [ ] `claimTask()` sets Agent + Status + Session ID atomically
- [ ] `submitProof()` validates: PR URL present, CI passing, summary ≥20 chars, Brain receipt present
- [ ] Tasks with `Governance Gate = true` require HITL before Done
- [ ] Proof validation rejects incomplete submissions with clear error messages
- [ ] Unit tests cover all adapter methods
- [ ] Integration test: create task → claim → submit proof → verify status flow

**Dependencies:** Notion database "Allura Symphony Board" created with schema from spec Section 1.

---

## Story 10.2 — Kanban Surface

> **NOTE (Brooks, 2026-06-06):** This story overlaps with Epic 11 Story 11.4 (Kanban Integration). Both wire the Kanban surface to the Notion Symphony source. Reconcile before build — keep ONE. Recommendation: 10.2 owns the data wiring (adapter → board), 11.4 is folded in OR scoped to drag-feedback polish only. Do not build both.

**Title:** Build Kanban surface wired to Notion Symphony task source with real-time status
**Priority:** P2-Medium | **Complexity:** Medium | **Agent:** Woz
**Roadmap Step:** 5

**Description:**
The existing Kanban skeleton has basic `draggable` with `onDragStart`/`onDrop` but no visual drag feedback and no backend connection. This story wires it to the `NotionTaskSource` adapter and adds proper interaction.

**Acceptance Criteria:**
- [ ] Columns match Symphony states: Backlog, Ready, In Progress, Review, Done, Rejected
- [ ] Cards load from Notion via `listByStatus()` on mount and every 30s
- [ ] Drag-drop updates status via `updateStatus()` with optimistic UI update
- [ ] Drag feedback: ghost card at 0.6 opacity, drop zone highlights with border color
- [ ] Card displays: title, agent badge, priority color (P0 red, P1 orange, P2 blue, P3 gray)
- [ ] Card click expands to show: description, PR URL, CI status, proof summary, Brain receipt
- [ ] Status transitions respect the state machine (no skipping states)
- [ ] Rejected cards show feedback in proof summary field
- [ ] Loading/empty/error states per DoD
- [ ] No hardcoded task data remains

**Dependencies:** Story 10.1 (Notion adapter must exist)

---

## Story 10.3 — Dreams / Scheduled Tasks Backend

**Title:** Build execution engine for scheduled tasks with cron scheduling and Brain persistence
**Priority:** P2-Medium | **Complexity:** Large | **Agent:** Woz
**Roadmap Step:** 6

**Description:**
The Dreams page is fully placeholder — hardcoded static array with a non-functional `addDream()`. This story builds the real backend: task persistence in Brain, cron scheduling, execution via Anthropic API, and result storage.

**Implementation Files:**
- `src/integrations/dreams/task-store.ts` — CRUD via Brain MCP (memories with `type: scheduled_task`)
- `src/integrations/dreams/scheduler.ts` — cron engine (`croner` library)
- `src/integrations/dreams/executor.ts` — executes task prompt via Anthropic API, stores result
- `src/integrations/dreams/types.ts` — `ScheduledTask`, `ExecutionResult` types

**Acceptance Criteria:**
- [ ] Create scheduled task with: name, prompt, agent, model, cron expression, enabled toggle
- [ ] Task stored in Brain as memory with `metadata.type: 'scheduled_task'`, `group_id: 'allura-system'`
- [ ] Cron engine evaluates schedules and triggers execution
- [ ] Execution: send prompt to Anthropic API (reuse chat proxy), store result as Brain trace with `source: 'scheduled_task'`
- [ ] Execution history: query Brain for traces matching task ID, show in expandable rows
- [ ] Run Now button triggers immediate execution
- [ ] Pause/Resume toggles `enabled` flag in Brain memory
- [ ] Status indicators: last run time, next run time, success/fail count, currently running
- [ ] Cron expression visual helper (human-readable preview: "Every day at 9:00 AM")
- [ ] No hardcoded data remains in DreamsPage
- [ ] Error recovery: failed executions logged with error, don't block next scheduled run
- [ ] Passes all 7 DoD checks

**Dependencies:** Anthropic API key in environment. Brain MCP `memory_add` for persistence. Chat proxy from Story 10.4 (can share, or build minimal version first).

---

## Story 10.4 — Chat Runtime

**Title:** Upgrade chat from search-only to full conversation agent with streaming, history, and model selection
**Priority:** P2-Medium | **Complexity:** Large | **Agent:** Woz
**Roadmap Step:** 7

**Description:**
`ChatSurface` currently does Brain memory search per turn with source attribution and typing indicators. This story adds: streaming responses via Anthropic SDK, persistent conversation history in Brain, model selection, file attachments, and conversation management.

**Architecture Decision:** Embedded Claude via Anthropic API (AD-1, decided 2026-06-06). Direct `/api/chat` proxy endpoint, not MCP-routed. (Open question per the AionUi comparison: whether to integrate the existing AionUi engine instead of building this proxy — resolve at epic start.)

**Implementation Files:**
- `src/api/chat.ts` (or Next.js route handler) — Anthropic SDK proxy with SSE streaming
- `src/integrations/chat/history.ts` — conversation persistence via Brain episodic traces
- `src/integrations/chat/context.ts` — Brain memory search + file injection per turn

**Feature Breakdown:**

| Feature | Implementation | Effort |
|---|---|---|
| Streaming responses | Anthropic SDK `stream: true`, SSE to frontend | Medium |
| Persistent history | Store turns as Brain episodic traces (`event_type: 'chat_turn'`, `group_id: 'allura-system'`) | Medium |
| Model selection | Dropdown: Claude Opus/Sonnet/Haiku. Persist to localStorage → Settings | Small |
| Agent routing | Brooks routing in proxy: parse intent → select system prompt per Team RAM agent | Medium |
| File attachments | File input → base64 or workspace upload → include as content block in API call | Medium |
| @-mentions for files | Autocomplete from workspace file list, inject file content into context | Medium |
| Conversation management | Sidebar: past conversations list, search, pin, delete, export | Medium |
| Error recovery | Retry on 429/500, show quota/rate limit state, fallback model on failure | Small |

**Acceptance Criteria:**
- [ ] Multi-turn conversation with streaming responses (SSE, tokens appear incrementally)
- [ ] Every turn persisted as Brain episodic trace with `group_id: 'allura-system'`
- [ ] Model switcher: Claude Opus, Sonnet, Haiku — switchable mid-conversation
- [ ] File attachment: select file → content included in next API call
- [ ] Conversation list loads from Brain history on app open
- [ ] Search across past conversations by content
- [ ] Pin/delete/export conversations
- [ ] Error states: honest retry messaging, rate limit display, fallback model suggestion
- [ ] Brain memory search still runs per turn for context augmentation
- [ ] Source attribution preserved on Brain-sourced responses
- [ ] Passes all 7 DoD checks

**Dependencies:** Anthropic API key in environment. Brain MCP `memory_add` for history persistence.

---

## Epic 10 Summary

| Story | Title | Priority | Complexity | Agent | Status | Blocked By |
|---|---|---|---|---|---|---|
| 10.1 | Notion Symphony Adapter | P1-High | Medium | Woz | Backlog | Epic 9 complete |
| 10.2 | Kanban Surface | P2-Medium | Medium | Woz | Backlog | Story 10.1 (reconcile with 11.4) |
| 10.3 | Dreams / Scheduled Tasks | P2-Medium | Large | Woz | Backlog | Epic 9 complete |
| 10.4 | Chat Runtime | P2-Medium | Large | Woz | Backlog | Epic 9 complete + AionUi build/integrate decision |

**Dependency Graph:**
```
Epic 9 (all stories) ──────────┐
                                ├──→ 10.1 Notion Adapter ──→ 10.2 Kanban Surface
                                ├──→ 10.3 Dreams (can share chat proxy with 10.4)
                                └──→ 10.4 Chat Runtime
```

Stories 10.1, 10.3, and 10.4 can run in parallel after Epic 9. Story 10.2 depends on 10.1.

**Epic Definition of Done:**
- Symphony orchestrator polling live tasks from Notion
- Kanban surface showing real task status with drag-drop state transitions
- Scheduled tasks creating and executing on cron with Brain persistence
- Chat supporting multi-turn streaming conversations with history
- All 4 surfaces passing DoD integration tests
- Zero hardcoded/placeholder data on any surface

---

> **Provenance:** Relocated from `docs/archive/allura/epic-10-orchestration-runtime.md` into `_bmad/bmm/planning/` on 2026-06-06.
