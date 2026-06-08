# Epic 9 — Truthfulness Infrastructure

> **Status:** Ready
> **Date:** 2026-06-06
> **Roadmap Steps:** 1–3 (+ quick wins)
> **Goal:** Make every existing surface tell the truth — real APIs, real status, enforced by automated tests
> **Principle:** One backend capability (Governance MCP) unlocks three surfaces. Build the foundation before adding features.
> **FRs covered:** FR26, FR27, FR28, FR29, FR30

---

## Story 9.1 — Governance MCP API Surface

**Title:** Build governance MCP tools for policy enforcement, gate checks, and config management
**Priority:** P0-Critical | **Complexity:** Large | **Agent:** Knuth (schema) → Woz (implementation)
**Traceability:** Epic 9 → FR26
**Roadmap Step:** 1

**Description:**
The Governance surface in the Allura app currently shows hardcoded example policies. Mission Control's Policy Controls section honestly marks governance as "needs wiring." This story builds the actual MCP tools that the frontend will call.

**Required MCP Tools:**

| Tool | Purpose | Input | Output |
|---|---|---|---|
| `governance_list_policies` | List all active governance policies | `group_id` | Array of policy objects |
| `governance_get_policy` | Get a single policy by ID | `group_id`, `policy_id` | Policy object with rules |
| `governance_check_gate` | Evaluate whether an action passes a policy gate | `group_id`, `action`, `context` | Pass/fail with reasons |
| `governance_update_policy` | Update policy config (HITL required) | `group_id`, `policy_id`, `config` | Updated policy |
| `governance_audit_log` | Query governance decision history | `group_id`, `filters` | Array of gate check results |

**Acceptance Criteria:**
- [ ] All 5 tools registered in Brain MCP `tools/list`
- [ ] `governance_list_policies` returns real policy objects from PostgreSQL
- [ ] `governance_check_gate` evaluates the 6 Allura invariants (group_id, append-only, SUPERSEDES, HITL, MCP-only, allura-* namespace)
- [ ] `governance_audit_log` queries append-only event store with pagination
- [ ] `governance_update_policy` requires HITL approval flag
- [ ] All tools enforce `group_id` pattern `^allura-[a-z0-9-]+$`
- [ ] Integration tests cover all tools with happy path + error cases

**Surfaces Unblocked:**
- Mission Control → Policy Controls (wire to `governance_list_policies` + `governance_check_gate`)
- Governance Log → wire to `governance_audit_log`
- Settings → Governance config (wire to `governance_get_policy` + `governance_update_policy`)

---

## Story 9.2 — Audit MCP API Surface

**Title:** Build audit MCP tools for compliance trails, event queries, and health reporting
**Priority:** P0-Critical | **Complexity:** Medium | **Agent:** Knuth (schema) → Woz (implementation)
**Traceability:** Epic 9 → FR27
**Roadmap Step:** 2

**Description:**
Mission Control needs audit trail data to show real system health. Currently it only probes `initialize`, `tools/list`, and `memory_list`. This story adds the audit tools that complete Mission Control.

**Required MCP Tools:**

| Tool | Purpose | Input | Output |
|---|---|---|---|
| `audit_query_events` | Query the append-only event store with filters | `group_id`, `filters`, `pagination` | Array of events |
| `audit_health_report` | Generate system health summary | `group_id` | Health object with per-subsystem status |
| `audit_agent_activity` | Query agent activity by time range | `group_id`, `agent_id`, `time_range` | Activity summary |
| `audit_invariant_check` | Run all 6 invariant checks and report violations | `group_id` | Array of check results (pass/fail/violation count) |

**Acceptance Criteria:**
- [ ] All 4 tools registered in Brain MCP `tools/list`
- [ ] `audit_query_events` supports filters: `agent_id`, `event_type`, `date_range`, `source`
- [ ] `audit_health_report` checks: PostgreSQL connection, Neo4j connection, embedding backfill status, curator queue depth, MCP tool availability
- [ ] `audit_invariant_check` validates all 6 governance invariants against live data
- [ ] Results are append-only — no audit trail modification
- [ ] Pagination works for large result sets (limit/offset)
- [ ] Integration tests cover each tool

**Surfaces Unblocked:**
- Mission Control → Health panel fully live (not just probe)
- Mission Control → Audit trail tab with real events

---

## Story 9.3 — Integration Test Harness (Definition of Done Enforcement)

**Title:** Build automated test harness that validates every surface against the 7-point Definition of Done
**Priority:** P1-High | **Complexity:** Large | **Agent:** Woz
**Traceability:** Epic 9 → FR28
**Roadmap Step:** 3

**Description:**
The Definition of Done is a checklist today. This story makes it an automated gate. Every surface gets a test file that validates all 7 checks against real (or mocked) API responses.

**Test Structure:**

```
src/tests/dod/
  ├── memory-surface.test.ts
  ├── curator-surface.test.ts
  ├── mission-control.test.ts
  ├── governance-surface.test.ts
  ├── chat-surface.test.ts
  ├── dreams-surface.test.ts
  ├── kanban-surface.test.ts
  ├── settings-surface.test.ts
  └── helpers/
      ├── dod-assertions.ts    # reusable 7-point check helpers
      └── mock-brain.ts        # mock Brain MCP for unit tests
```

**7-Point DoD Checks (per surface):**

| # | Check | Test Method |
|---|---|---|
| 1 | Loading state | Render component with pending API → assert skeleton/spinner visible |
| 2 | Empty state | Render with empty API response → assert "no data" message + next action |
| 3 | Error state | Render with API error → assert error message + retry/escalation |
| 4 | Ready state | Render with real data shape → assert data rendered correctly |
| 5 | Real API | Assert component calls actual MCP/Brain endpoint (not hardcoded) |
| 6 | Correct next action | Assert empty/error states include actionable guidance |
| 7 | No fake status | Assert no hardcoded "Healthy"/"Live"/"Connected" strings without API backing |

**Acceptance Criteria:**
- [ ] Test harness runs via `bun run test:dod`
- [ ] Every surface has a test file covering all 7 checks
- [ ] `dod-assertions.ts` provides reusable matchers: `expectLoadingState()`, `expectEmptyState()`, `expectErrorState()`, `expectReadyState()`, `expectRealApi()`, `expectNextAction()`, `expectNoFakeStatus()`
- [ ] Surfaces that are honestly marked "not wired" pass with a `skip` annotation (not a fake pass)
- [ ] CI blocks merge if any DoD test fails on a wired surface
- [ ] Test report shows per-surface DoD status as a table

**Dependencies:** Stories 9.1 + 9.2 (governance/audit tools must exist for those surface tests)

---

## Story 9.4 — Wire Memory Add Modal

**Title:** Connect Memory Add modal Save button to `memory_add` MCP tool
**Priority:** P1-High | **Complexity:** Small | **Agent:** Woz
**Traceability:** Epic 9 → FR29
**Roadmap Step:** Quick win (unblocked now)

**Description:**
The Add Memory modal exists in the Memory surface but the Save handler is not connected to the Brain MCP `memory_add` tool. This is the smallest wiring gap in the app.

**Acceptance Criteria:**
- [ ] Save button calls `memory_add` with: `group_id: "allura-system"`, `user_id`, `content` from form
- [ ] Loading state shown during API call
- [ ] Success → toast notification + close modal + refresh memory list
- [ ] Error → error message in modal with retry button
- [ ] Empty content validation (prevent submitting blank memories)
- [ ] Content field supports multiline text
- [ ] Passes DoD test (Story 9.3)

---

## Story 9.5 — Wire Settings Capabilities

**Title:** Connect Settings capabilities and remote config to real config store
**Priority:** P1-High | **Complexity:** Small | **Agent:** Woz
**Traceability:** Epic 9 → FR30
**Roadmap Step:** Quick win (unblocked now)

**Description:**
The Settings surface has working agent config but the capabilities section and remote config are placeholders. Wire them to real storage (localStorage for client preferences, Brain for shared config).

**Acceptance Criteria:**
- [ ] Agent config continues working as-is
- [ ] Capabilities section reads from actual runtime state (which MCP tools are available)
- [ ] Remote config shows connected MCP server status (from Mission Control probe)
- [ ] Model preference dropdown persists to localStorage
- [ ] Theme preference persists to localStorage (prep for Epic 11 Story 11.3 Dark Mode)
- [ ] No placeholder text remains in Settings
- [ ] Passes DoD test (Story 9.3)

---

## Epic 9 Summary

| Story | Title | Priority | Complexity | Agent | Status |
|---|---|---|---|---|---|
| 9.1 | Governance MCP API Surface | P0-Critical | Large | Knuth → Woz | Ready |
| 9.2 | Audit MCP API Surface | P0-Critical | Medium | Knuth → Woz | Ready |
| 9.3 | Integration Test Harness | P1-High | Large | Woz | Ready (partial, grows with each surface) |
| 9.4 | Wire Memory Add Modal | P1-High | Small | Woz | Ready |
| 9.5 | Wire Settings Capabilities | P1-High | Small | Woz | Ready |

**Epic Definition of Done:**
- All 5 governance MCP tools registered and tested
- All 4 audit MCP tools registered and tested
- Integration test harness running in CI
- Memory Add modal saves to Brain
- Settings shows real capability/config state
- Zero hardcoded placeholder data in any surface touched by this epic

---

> **Provenance:** Relocated from `docs/archive/allura/epic-9-truthfulness-infrastructure.md` into the canonical BMAD planning surface (`_bmad/bmm/planning/`) on 2026-06-06. Cross-references updated for the Epic 11 renumber (UX Polish).
