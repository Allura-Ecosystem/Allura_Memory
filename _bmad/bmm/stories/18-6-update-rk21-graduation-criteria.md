# Story 18.6 — Update RK-21 Mitigation Graduation Criteria

**Status:** Done — authoritative sprint status
## Dev Agent Record

- Story started: 2026-07-12 (Brooks)
- Story completed: 2026-07-12 (Woz)
- Build environment: local Linux, Bun runtime
- Files modified: `docs/allura/RISKS-AND-DECISIONS.md`, `_bmad/bmm/stories/18-6-update-rk21-graduation-criteria.md`
- Validation: `git diff --check` passed, no whitespace violations

## User Story

As the Allura risk owner, I need RK-21 (Full RuVector overclaim creates false runtime trust) mitigation updated with explicit graduation criteria, so that there's a documented, testable path for upgrading the `runtime_readiness` label from `pgvector_bridge` to `ruvector_graph` to `full_ruvector`.

## Context

- Current RK-21 mitigation says: "Keep pgvector bridge label until ruvector extension/functions and feedback/search health pass"
- This doesn't distinguish the graph adapter cutover from the native extension activation
- The graph adapter (AD-029/AD-49) can graduate to `ruvector_graph` independently of the native extension graduating to `full_ruvector`
- Need explicit criteria for each graduation step

## Acceptance Criteria

- [x] AC-1: RK-21 mitigation is expanded with a two-stage graduation path
- [x] AC-2: Stage 1 graduation (`pgvector_bridge` → `ruvector_graph`): live-DB E2E passes with `GRAPH_BACKEND=ruvector`, dual-read validation clean for one release, parity test 14/14 green, TALON sign-off
- [x] AC-3: Stage 2 graduation (`ruvector_graph` → `full_ruvector`): native RuVector extension installed, `ruvector_function_count > 0`, HNSW index health validated, search/feedback health validated, TALON sign-off
- [x] AC-4: RK-21 risk detail cross-references AD-49 (graph cutover), AD-34 (native extension parked), REQ-RV-005 (label upgrade requirement)
- [x] AC-5: The mitigation preserves the existing TALON evidence (`vector=0.8.2`, `ruvector_function_count=0`, memory count ~3392)
- [x] AC-6: AI-Assisted Documentation notice preserved

## Tasks

1. [x] Read current RK-21 in Risk Summary table (line 113) and Risk Detail table (line 149)
2. [x] Read AD-49 (after Story 18.1 promotes) for the cutover criteria
3. [x] Read REQ-RV-005 (after Story 18.4 adds it) for the label upgrade requirement
4. [x] Expand RK-21 mitigation with the two-stage graduation path
5. [x] Add cross-references to AD-49, AD-34, REQ-RV-005
6. [x] Run `git diff --check`

## File List

- `docs/allura/RISKS-AND-DECISIONS.md` (edit — expand RK-21 mitigation)

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-07-12 | Story created | Brooks |
| 2026-07-12 | Expanded RK-21 mitigation with two-stage graduation criteria (pgvector_bridge → ruvector_graph → full_ruvector); cross-references AD-49, AD-34, REQ-RV-005 | Woz |

---

## Done Gate Evidence

- [x] AC-1 AC-2 AC-3 AC-4 AC-5 AC-6 — all acceptance criteria satisfied
- [x] `git diff --check` passed — no whitespace violations
- [x] AI-Assisted Documentation notice preserved at lines 3-7 in RISKS-AND-DECISIONS.md
- [x] Risk Summary table row (line 113) unchanged — only expanded Risk Detail mitigation (line 151)
