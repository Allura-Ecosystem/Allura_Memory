# Goal Definition — Allura Beta Readiness (.95 Roadmap)

> Date: 2026-06-06 · Owner: Sabir · Authored via /define-goal · group_id: allura-system

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GOAL DEFINITION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Goal:** Move Allura from working prototype to a beta-ready Mission Control platform with live visibility into memory, governance, health, approvals, tasks, and activity, guiding users through clear, status-narrating workflows.

**Outcome:** A user opens Allura and immediately understands — without engineering knowledge or logs — what is happening, what is connected, what is healthy, what needs attention, and what to do next. Every production surface renders real data with honest states; no mock or placeholder surfaces remain.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE REQUIREMENTS (non-negotiable)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. **Live, not mock** — every production surface (Memory, Curator, Health, Governance, Audit, Scheduled Tasks, Dreams, Graph) is backed by a real Brain/governance/audit API call; zero hardcoded/placeholder production data.
2. **Honest states everywhere** — every page implements loading, empty, error, and ready states, states what the system is doing, and surfaces the correct next action (the 7-point Definition of Done).
3. **Governance upheld** — all new APIs enforce `group_id` `^allura-[a-z0-9-]+$`, append-only PostgreSQL, SUPERSEDES versioning, HITL-only promotion, MCP-only DB access.
4. **Validation gates pass** — integration, contract, and end-to-end tests green; Team Durham validation passed; verified on desktop AND mobile.
5. **Chat runtime resolved** — build-vs-integrate-AionUi decision made and the chosen runtime integrated (memory retrieval + persistence + conversation state operational).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUCCESS CRITERIA (measurable)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Live data (binary per surface):
- [ ] Memory surfaces · [ ] Curator · [ ] Health · [ ] Governance · [ ] Audit · [ ] Scheduled Tasks · [ ] Dreams · [ ] Graph relationship traversal operational

User experience:
- [ ] 100% of pages have loading + empty + error + ready states
- [ ] Every page explains system status + next action
- [ ] Desktop validated · [ ] Mobile validated

Chat runtime:
- [ ] Runtime strategy selected · [ ] Runtime integrated · [ ] Memory retrieval · [ ] Memory persistence · [ ] Conversation state

Governance:
- [ ] Governance APIs · [ ] Audit APIs · [ ] Policy APIs implemented · [ ] Governance workflows validated · [ ] Approval workflows validated

Validation:
- [ ] Team Durham validation complete · [ ] Integration tests pass · [ ] Contract tests pass · [ ] E2E tests pass
- [ ] 0 mock data remaining · [ ] 0 placeholder production surfaces

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIORITY ORDER (goal-level)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- **Wave 1 (Truthfulness):** Curator live, Health live, Governance APIs, Audit APIs
- **Wave 2 (Orchestration):** Dreams feed, Scheduled Tasks, Graph traversal, Governance workflows
- **Wave 3 (Runtime + Release):** Chat runtime, Mobile hardening, full integration validation, release-candidate testing

> ⚠️ **Reconciliation note (Brooks):** This goal's wave-bucketing differs from the committed BMAD epic files and must be aligned before execution to avoid drift:
> - Committed epics: **Epic 9** = Truthfulness Infra (9.1 Governance MCP, 9.2 Audit MCP, 9.3 DoD harness, 9.4 Memory-Add, 9.5 Settings); **Epic 10** = Orchestration (10.1 Notion adapter, 10.2 Kanban, 10.3 Dreams, **10.4 Chat Runtime**); **Epic 11** = UX Polish.
> - This goal places **Chat runtime in Wave 3**, but it is committed as **Epic 10.4**. And **Graph traversal** is a Wave-2 success criterion but currently has **no story** (it was an honestly-deferred AC in Story 8-3 — needs a `graph_query` MCP tool). **Action:** either add a Graph-traversal story and move Chat to its own late wave in the epic files, or treat this goal as outcome-level and keep the epic decomposition as the execution truth. Decision owner: Ronin.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEFINITION OF DONE (exit criteria)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Allura is beta-ready when ALL hold:
- [ ] Curator, Health, Governance, Audit, Dreams, Scheduled Tasks, Graph traversal — all LIVE
- [ ] Chat runtime operational
- [ ] Team Durham validation passes · [ ] Mobile QA passes · [ ] Integration tests pass
- [ ] 0 mock data remains
- [ ] Status-narrating UX standard met: on open, the user understands what's happening / connected / healthy / needs attention / next action — no engineering knowledge or logs required

---

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.
