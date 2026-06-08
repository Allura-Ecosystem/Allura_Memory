# Epic 10 — Orchestration & Runtime

> **Status:** Backlog (blocked by Epic 9)
> **Date:** 2026-06-06 (updated 2026-06-07 — story splits, FR traceability)
> **Roadmap Steps:** 4–7
> **Goal:** Add the runtime features that make Allura an active agent — task orchestration, background automation, and conversational interface
> **Prerequisite:** Epic 9 complete (truthfulness infrastructure in place, DoD tests passing)
> **FRs covered:** FR31, FR32, FR33, FR34

---

## Story 10.1 — Notion Symphony Adapter

**Title:** Implement NotionTaskSource adapter for Symphony orchestration via MCP_DOCKER Notion tools
**Priority:** P1-High | **Complexity:** Medium | **Agent:** Woz
**Roadmap Step:** 4
**Traceability:** Epic 10 → FR31

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
**Traceability:** Epic 10 → FR32

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

## Story 10.3a — Dreams Task Store

**Title:** Build scheduled task CRUD via Brain MCP persistence
**Priority:** P2-Medium | **Complexity:** Small | **Agent:** Woz
**Roadmap Step:** 6a
**Traceability:** Epic 10 → FR33

**Description:**
Create `src/integrations/dreams/task-store.ts` and `types.ts`. CRUD operations via Brain MCP (`memory_add` with `metadata.type: 'scheduled_task'`, `group_id: 'allura-system'`).

**Acceptance Criteria:**
- [ ] Create scheduled task with: name, prompt, agent, model, cron expression, enabled toggle
- [ ] Task stored in Brain as memory with `metadata.type: 'scheduled_task'`, `group_id: 'allura-system'`
- [ ] Read, update, delete (soft-delete) operations work through Brain MCP
- [ ] Pause/Resume toggles `enabled` flag in Brain memory
- [ ] Unit tests cover all CRUD operations

**Dependencies:** Brain MCP `memory_add` available

---

## Story 10.3b — Dreams Scheduler and Executor

**Title:** Build cron scheduling engine and task execution via Anthropic API
**Priority:** P2-Medium | **Complexity:** Medium | **Agent:** Woz
**Roadmap Step:** 6b
**Traceability:** Epic 10 → FR33

**Description:**
Create `src/integrations/dreams/scheduler.ts` and `executor.ts`. Cron engine using `croner` library evaluates schedules and triggers execution. Executor sends prompt to Anthropic API, stores result as Brain trace.

**Acceptance Criteria:**
- [ ] Cron engine evaluates schedules and triggers execution at correct times
- [ ] Execution sends prompt to Anthropic API and stores result as Brain trace with `source: 'scheduled_task'`
- [ ] Run Now button triggers immediate execution
- [ ] Status indicators: last run time, next run time, success/fail count, currently running
- [ ] Cron expression visual helper (human-readable preview: "Every day at 9:00 AM")
- [ ] Error recovery: failed executions logged with error, don't block next scheduled run
- [ ] Unit tests cover scheduler and executor

**Dependencies:** Story 10.3a (task store), Anthropic API key in environment

---

## Story 10.3c — Dreams UI Wiring

**Title:** Wire DreamsPage to live task store with execution history
**Priority:** P2-Medium | **Complexity:** Small | **Agent:** Woz
**Roadmap Step:** 6c
**Traceability:** Epic 10 → FR33

**Description:**
Replace hardcoded static array in DreamsPage with live data from task store. Show execution history by querying Brain for traces matching task ID.

**Acceptance Criteria:**
- [ ] DreamsPage loads tasks from Brain task store on mount
- [ ] Create/edit/delete tasks through UI forms connected to task store
- [ ] Execution history: query Brain for traces matching task ID, show in expandable rows
- [ ] No hardcoded data remains in DreamsPage
- [ ] Passes all 7 DoD checks

**Dependencies:** Stories 10.3a + 10.3b

---

## Story 10.4a — Chat Proxy and Streaming

**Title:** Build /api/chat proxy with Anthropic SDK streaming and basic multi-turn
**Priority:** P2-Medium | **Complexity:** Medium | **Agent:** Woz
**Roadmap Step:** 7a
**Traceability:** Epic 10 → FR34
**Architecture Decision:** Embedded Claude via Anthropic API (AD-1, decided 2026-06-06). Direct `/api/chat` proxy endpoint, not MCP-routed. (Open question: whether to integrate AionUi engine — resolve at epic start.)

**Description:**
Create `/api/chat` route handler using Anthropic SDK with `stream: true` and SSE to frontend. Basic multi-turn conversation with system prompt.

**Acceptance Criteria:**
- [ ] `/api/chat` route handler accepts messages array and returns SSE stream
- [ ] Multi-turn conversation with streaming responses (tokens appear incrementally)
- [ ] Brain memory search runs per turn for context augmentation
- [ ] Source attribution preserved on Brain-sourced responses
- [ ] Error states: honest retry messaging, rate limit display
- [ ] Unit and integration tests cover proxy endpoint

**Dependencies:** Anthropic API key in environment, Epic 9 complete

---

## Story 10.4b — Chat History and Context

**Title:** Add persistent conversation history via Brain and per-turn context injection
**Priority:** P2-Medium | **Complexity:** Medium | **Agent:** Woz
**Roadmap Step:** 7b
**Traceability:** Epic 10 → FR34

**Description:**
Create `src/integrations/chat/history.ts` and `context.ts`. Persist every turn as Brain episodic trace. Load conversation list from Brain on app open.

**Acceptance Criteria:**
- [ ] Every turn persisted as Brain episodic trace with `group_id: 'allura-system'`, `event_type: 'chat_turn'`
- [ ] Conversation list loads from Brain history on app open
- [ ] Search across past conversations by content
- [ ] Brain memory search still runs per turn for context augmentation
- [ ] Passes all 7 DoD checks

**Dependencies:** Story 10.4a (chat proxy must exist)

---

## Story 10.4c — Chat Polish

**Title:** Add model selection, file attachments, @-mentions, and conversation management
**Priority:** P2-Medium | **Complexity:** Medium | **Agent:** Woz
**Roadmap Step:** 7c
**Traceability:** Epic 10 → FR34

**Description:**
Polish layer on top of working chat. Model switcher, file input, @-mention autocomplete, conversation sidebar (pin/delete/export).

**Acceptance Criteria:**
- [ ] Model switcher: Claude Opus, Sonnet, Haiku — switchable mid-conversation, persists to localStorage
- [ ] File attachment: select file → content included in next API call
- [ ] @-mentions: autocomplete from workspace file list, inject file content into context
- [ ] Pin/delete/export conversations
- [ ] Fallback model suggestion on failure
- [ ] Passes all 7 DoD checks

**Dependencies:** Stories 10.4a + 10.4b

---

## Epic 10 Summary

| Story | Title | Priority | Complexity | Agent | Status | Blocked By |
|---|---|---|---|---|---|---|
| 10.1 | Notion Symphony Adapter | P1-High | Medium | Woz | Backlog | Epic 9 complete |
| 10.2 | Kanban Surface | P2-Medium | Medium | Woz | Backlog | Story 10.1 (reconcile with 11.4) |
| 10.3a | Dreams Task Store | P2-Medium | Small | Woz | Backlog | Epic 9 complete |
| 10.3b | Dreams Scheduler + Executor | P2-Medium | Medium | Woz | Backlog | Story 10.3a |
| 10.3c | Dreams UI Wiring | P2-Medium | Small | Woz | Backlog | Stories 10.3a + 10.3b |
| 10.4a | Chat Proxy + Streaming | P2-Medium | Medium | Woz | Backlog | Epic 9 complete |
| 10.4b | Chat History + Context | P2-Medium | Medium | Woz | Backlog | Story 10.4a |
| 10.4c | Chat Polish | P2-Medium | Medium | Woz | Backlog | Stories 10.4a + 10.4b |

**Dependency Graph:**
```
Epic 9 (all stories) ──────────┐
                                ├──→ 10.1 Notion Adapter ──→ 10.2 Kanban Surface
                                ├──→ 10.3a Task Store ──→ 10.3b Scheduler ──→ 10.3c UI Wiring
                                └──→ 10.4a Chat Proxy ──→ 10.4b History ──→ 10.4c Polish
```

Stories 10.1, 10.3a, and 10.4a can run in parallel after Epic 9.

**Epic Definition of Done:**
- Symphony orchestrator polling live tasks from Notion
- Kanban surface showing real task status with drag-drop state transitions
- Scheduled tasks creating and executing on cron with Brain persistence
- Chat supporting multi-turn streaming conversations with history
- All 8 stories passing DoD integration tests
- Zero hardcoded/placeholder data on any surface

---

> **Provenance:** Relocated from `docs/archive/allura/epic-10-orchestration-runtime.md` into `_bmad/bmm/planning/` on 2026-06-06.

---

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.
