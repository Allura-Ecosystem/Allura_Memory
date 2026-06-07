# Planning Conventions

This document captures the planning rules that apply across all BMAD artifacts in `_bmad/bmm/`. Conventions are added when a recurring drift pattern is observed and removed when the underlying ambiguity is resolved at a higher level (e.g. a fixed workflow or schema change).

## Goal vs Epic Reconciliation

**Rule:** A goal artifact in `docs/archive/planning-artifacts/goals/` is the **outcome-level north star**. Committed epic files in `_bmad/bmm/planning/` are the **execution truth**. When a goal's wave-bucketing does not match the committed epic decomposition, the goal is annotated with a `Reconciliation note` block and the epics are NOT changed to match.

**Why:** Goals change less often than execution plans. Realigning epics every time a goal is refreshed creates churn in the planning chain and obscures the actual execution commitments. The goal becomes a navigation aid; the epics are what work is tracked against.

**How to apply:**

1. When a goal is authored (or revised), cross-reference the goal's wave list against the current epic file list. If a goal item is not represented in any epic, add a `Reconciliation note` block to the goal listing the missing item and the recommendation.
2. When a goal item is committed as an epic story, update the goal's `Reconciliation note` to mark the item as "satisfied by <story-id>". Do not delete the note; it is a permanent record of how drift was handled.
3. When a goal item cannot be traced to any epic or story (and the recommendation is to add a story), follow the standard story-creation flow: create the story file in `_bmad/bmm/stories/`, set status to `ready-for-dev`, and link from the goal's reconciliation note.

**Active reconciliation items** (see `allura-beta-readiness.md`):

| Goal item | Status | Traced to |
|---|---|---|
| Chat runtime (build-vs-AionUi) | Open decision; epic Story 10-4 exists, goal places it in Wave 3 | `10-4-chat-runtime` (backlog) |
| Graph traversal (Wave-2 success criterion) | Story created 2026-06-07, status `ready-for-dev` | `8-7-graph-traversal-mcp-surface` |
| MCP Tools Dashboard (Phase 3 roadmap) | Out of beta scope; deferred | _none — document in retrospective_ |
| Workspace / Files (Phase 4 roadmap) | Out of beta scope; deferred | _none — document in retrospective_ |

**Approved by:** Brooks (orchestrator), 2026-06-07, as a permanent planning convention.

---

## Story Status Discipline

**Rule:** Story status transitions are append-only. Once a story moves from `backlog` → `ready-for-dev` → `in-progress` → `review` → `done`, it does not return to a previous status. If a story is reopened after `done`, create a successor story with a `-v2` or `-followup` suffix; do not edit the original story's status.

**Why:** Append-only status prevents the review-audit log from being rewritten. Reviewers and curators rely on the story's history to understand when work was actually completed.

**Applies to:** all stories in `_bmad/bmm/stories/`.

---

## Cross-Repo Stories

**Rule:** A story whose work lands in a different repository (e.g. dashboard work in `team_durham/allura-app` rather than `Allura_Memory`) must still have its story file, status, and sprint-status entry tracked in this repo. Each cross-repo story's `File List` section must record the target branch and PR URL of the cross-repo work.

**Why:** Local sprint-status is the canonical reconciliation surface. Cross-repo work tracked only in the foreign repo's issues board is invisible to the BMAD planning chain.

**Example:** Story 9-4 (Memory-Add wiring) is a server-side story in this repo. Story 9-5 (Settings capabilities) is a dashboard-side story in `team_durham/allura-app`. Both have story files in `_bmad/bmm/stories/` with `File List` recording their respective target branches.
