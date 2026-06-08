---
title: Implementation Readiness Report — Epics 9 / 10 / 11
date: 2026-06-06
assessor: Brooks (Implementation Readiness)
stepsCompleted: [discovery, prd-analysis, epic-coverage, ux-alignment, epic-quality, final-assessment]
scope: Epics 9 (Truthfulness Infrastructure), 10 (Orchestration & Runtime), 11 (UX Polish)
verdict: CONDITIONAL GO — Epic 9 ready to start; resolve 5 conditions before/at kickoff
---

# Implementation Readiness Report — Epics 9 / 10 / 11

> Decision basis: Allura Brain (planning records authoritative; older `allura-memory` dashboard sunset at Epic 5 closeout in favor of the `team_durham/allura-app` build). Authoritative for this scope: `epic-9/10/11-*.md` + `allura-app-95-roadmap.md`. Historical (sunset dashboard): `epics.md`, `source-docs/EPICS-dashboard-v2.md`.

## 1. Document Inventory

| Type | Authoritative | Historical / Other |
|---|---|---|
| Epics | `epic-9/10/11-*.md`, `allura-app-95-roadmap.md` | `epics.md`, `source-docs/EPICS-dashboard-v2.md` (sunset dashboard) |
| PRD | — (none for beta scope) | `source-docs/PRD-DESIGN-SYSTEM-v1.md`, `PRD-TEAM-RAM-v1.md` (different scopes) |
| Architecture | `docs/allura/SOLUTION-ARCHITECTURE.md`, `BLUEPRINT.md`, `DESIGN-ALLURA.md` | `RISKS-AND-DECISIONS.md`, `DATA-DICTIONARY.md`, `REQUIREMENTS-MATRIX.md` (Engine-scoped) |
| UX | `docs/design/DASHBOARD-VISUAL-SPEC-v2.md`, `epic-11-ux-polish.md` | — |
| Stories | `_bmad/bmm/stories/9-1..9-5` (ready-for-dev) | 1-x..8-x (done) |

## 2. Requirements Traceability (PRD → Epic → Story)

- **Roadmap-backed, not PRD-backed.** Epics 9/10/11 trace to `allura-app-95-roadmap.md` (Current-State table + 7-point DoD + score projection), not to a numbered-FR PRD. The two existing PRDs cover Design-System and Team-RAM, not the dashboard beta. `docs/allura/REQUIREMENTS-MATRIX.md` is Engine-scoped and does **not** include dashboard FRs.
- **Impact:** Acceptable for an internal tool — the roadmap is detailed and every story has testable ACs — but there is no FR-ID traceability matrix. Coverage is judged against the roadmap's Current-State gaps instead.

## 3. Epic / Story Coverage vs Roadmap Gaps

| Roadmap gap | Covered by | Status |
|---|---|---|
| Memory Add wiring | 9.4 | ✅ |
| Settings capabilities | 9.5 | ✅ |
| Governance enforcement | 9.1 | ✅ |
| Mission Control health/audit | 9.2 | ✅ |
| DoD enforcement | 9.3 | ✅ |
| Chat runtime | 10.4 | ✅ (decision pending) |
| Dreams/scheduled tasks | 10.3 | ✅ |
| Kanban | 10.2 / 11.4 | ✅ (reconciled: 10.2 data, 11.4 polish) |
| **MCP Tools Dashboard** (roadmap Phase 3) | — | ❌ **No story** |
| **Workspace / Files** (roadmap Phase 4) | — | ❌ **No story** |

Two roadmap surfaces have no story — must be explicitly scoped in or out of beta.

## 4. UX Alignment

- Epic 11 ACs are concrete and testable (Cmd+K, toasts, dark mode, motion, mobile, Kanban polish).
- UX reference is `DASHBOARD-VISUAL-SPEC-v2.md` — confirm it reflects the **current** `allura-app` build (it may predate the sunset/rebuild). Low risk.
- Dependencies correct: 11.x gated on Epics 9+10; 11.4 gated on 10.2.

## 5. Epic / Story Quality

- Epic 9 stories: clear ACs, agent assignments (Knuth→Woz / Woz), task breakdowns, governance dev-notes. Sequencing sound (9.3 depends on 9.1/9.2).
- DAG clean: 9.1 keystone → unblocks 3 surfaces; Epic 10 gated on Epic 9; 11 on 9+10.
- Governance baked in: `group_id`, append-only, HITL (`governance_update_policy` HITL-gated), MCP-only. Strong.

## 6. Findings (conditions to resolve)

| ID | Sev | Finding | Resolution |
|---|---|---|---|
| C1 | High | **Two-repo epic.** Server stories (9.1–9.3) → `Allura_Memory`; dashboard stories (9.4, 9.5, 10.x UI, 11.x) → separate repo `Charitablebusinessronin/team_durham` (allura-app, branch `master`). Sprint-status lives only in Allura_Memory. | Decide cross-repo tracking: mirror sprint-status, or per-repo story status + a linking convention. Two PR streams expected. |
| C2 | Med | **No beta-scope PRD** — roadmap-backed traceability only. | Accept roadmap as lightweight PRD (recommended for internal tool) OR write a thin beta PRD with FR IDs. |
| C3 | Med | **Uncovered surfaces:** MCP Tools Dashboard + Workspace/Files have no stories. | Scope in (add stories) or out (mark deferred-post-beta). |
| C4 | Med | **Chat runtime decision open** — build vs integrate AionUi (gates 10.4). | Make the architecture call before Epic 10 starts. |
| C5 | Low | **Governance tenant** — dashboard reads Brain as `allura-system`, but it is the Team Durham app (`team_durham` repo, hooks reference `allura-team-durham`). | Confirm intended tenant for dashboard reads/writes. |
| C6 | Low | Historical epic docs (`epics.md`, `EPICS-dashboard-v2.md`) may confuse. | Mark as sunset/historical in-file. |

## 7. Verdict

**CONDITIONAL GO.**

- **Epic 9 — READY to start.** Story 9.4 (quick win) and 9.1 (keystone) can begin now. 9.1/9.2 are server-side in this repo (clean). 9.4/9.5/9.3 are dashboard-side → resolve **C1** (which repo/PR flow) first so dashboard work is tracked.
- **Epic 10 — NOT ready.** Correctly backlog; gated on Epic 9 + **C4** (chat decision) + **C3** (Kanban/Notion deps).
- **Epic 11 — NOT ready.** Correctly backlog; gated on Epics 9+10.

**Recommended first actions:** (1) resolve C1 cross-repo tracking; (2) start Story 9.1 (Governance MCP, this repo) + Story 9.4 (Memory Add, team_durham repo) in parallel; (3) make the C4 chat decision before Epic 10.

---
> Provenance: BMAD implementation-readiness check, 2026-06-06. Supersedes the Engine-scoped `implementation-readiness-report-2026-05-24.md` for dashboard-beta scope only.
