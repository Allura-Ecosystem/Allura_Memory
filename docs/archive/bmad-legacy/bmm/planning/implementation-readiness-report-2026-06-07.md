---
stepsCompleted: ["step-01-document-discovery", "step-02-prd-analysis", "step-03-epic-coverage", "step-04-ux-alignment", "step-05-epic-quality", "step-06-final-assessment"]
filesIncluded:
  prd:
    - _bmad/bmm/planning/source-docs/PRD-DESIGN-SYSTEM-v1.md
    - _bmad/bmm/planning/source-docs/PRD-TEAM-RAM-v1.md
  architecture:
    - docs/allura/BLUEPRINT.md
    - docs/allura/SOLUTION-ARCHITECTURE.md
    - docs/allura/DESIGN-ALLURA.md
    - docs/allura/REQUIREMENTS-MATRIX.md
    - docs/allura/RISKS-AND-DECISIONS.md
    - docs/allura/DATA-DICTIONARY.md
  epics:
    - _bmad/bmm/planning/epics.md
    - _bmad/bmm/planning/epic-9-truthfulness-infrastructure.md
    - _bmad/bmm/planning/epic-10-orchestration-runtime.md
    - _bmad/bmm/planning/epic-11-ux-polish.md
    - _bmad/bmm/planning/source-docs/EPICS-dashboard-v2.md
  ux:
    - archive/docs/design/DASHBOARD-VISUAL-SPEC-v2.md
    - archive/docs/design/DASHBOARD-VISUAL-AUDIT-2026-05-21.md
  stories: _bmad/bmm/stories/ (47 files)
  other:
    - _bmad/bmm/planning/allura-app-95-roadmap.md
    - _bmad/bmm/planning/conventions.md
    - _bmad/bmm/planning/symphony-notion-adapter-spec.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-07
**Project:** Allura Memory

## 1. Document Discovery

### Inventory

| Category | Files Found | Location |
|----------|------------|----------|
| PRD | 2 | `_bmad/bmm/planning/source-docs/` |
| Architecture (canonical six) | 6 | `docs/allura/` |
| Epics | 5 | `_bmad/bmm/planning/` |
| Stories | 47 | `_bmad/bmm/stories/` |
| UX/Visual | 2 (archived) | `archive/docs/design/` |
| Other planning | 3 | `_bmad/bmm/planning/` |

### Issues
- **No duplicates** found
- **⚠️ Stale config reference:** `_bmad/bmm/config.yaml` points to `docs/design/DASHBOARD-VISUAL-SPEC-v2.md` — file is at `archive/docs/design/DASHBOARD-VISUAL-SPEC-v2.md`
- UX design spec is archived, not in active planning surface

## 2. PRD Analysis

### PRD-DESIGN-SYSTEM-v1: Functional Requirements (23)

| ID | Requirement |
|----|-------------|
| DS-F1 | Color system with semantic roles |
| DS-F2 | Typography scale: 12 grades, Inter font |
| DS-F3 | Spacing scale: 4px base, 24 steps |
| DS-F4 | Shadow system: 5 elevations |
| DS-F5 | Border radius scale |
| DS-F6 | StatusBadge: 5 states with color + icon |
| DS-F7 | ConfidenceBar: 0-100% with color thresholds |
| DS-F8 | TraceCard: Tool call display |
| DS-F9 | EmptyState: Zero-data placeholder |
| DS-F10 | PanelDrawer: 420px desktop / 100% mobile |
| DS-F11 | MemoryCard: Composes StatusBadge + ConfidenceBar + text + actions |
| DS-F12 | GraphTab: ForceGraph2D Neo4j visualization |
| DS-F13 | Mission Control shell: Header + sidebar + main |
| DS-F14 | Section tabs: Memories, Insights, Trace Logs, Provenance, Extracted Facts, Approval Queue |
| DS-F15 | Metric cards: KPI display |
| DS-F16 | Activity feed: Chronological event timeline |
| DS-F17 | Search input: Scoped with group_id, hybrid search |
| DS-F18 | Responsive behavior: Desktop/Tablet/Mobile |
| DS-F19 | Curator queue table: Sortable columns |
| DS-F20 | Proposal detail view: Memory + provenance + evidence |
| DS-F21 | Action buttons: Approve/Reject/Deprecate/Edit |
| DS-F22 | Batch operations: Multi-select + bulk approve/reject |
| DS-F23 | Audit trail sidebar |

### PRD-DESIGN-SYSTEM-v1: Non-Functional Requirements (7)

| ID | Requirement |
|----|-------------|
| DS-NFR1 | WCAG 2.1 AA color contrast 4.5:1 |
| DS-NFR2 | Keyboard navigation (2.1.1) |
| DS-NFR3 | Focus indicators (2.4.7) |
| DS-NFR4 | Screen reader support (1.3.1) |
| DS-NFR5 | Motion preferences respected (2.3.3) |
| DS-NFR6 | Touch targets min 44×44px |
| DS-NFR7 | Responsive breakpoints: 1440/1280/768/375px |

### PRD-TEAM-RAM-v1: Functional Requirements (23)

| ID | Requirement |
|----|-------------|
| TR-F1 | Agent definitions as markdown with frontmatter |
| TR-F2 | Model assignments per agent: primary + fallback |
| TR-F3 | Tool restrictions enforced per agent |
| TR-F4 | Skill ownership matrix |
| TR-F5 | Agent status tracking in Neo4j |
| TR-F6 | Intent classification into 6 categories |
| TR-F7 | Role-first routing |
| TR-F8 | Task override: user explicit route takes precedence |
| TR-F9 | Fallback-only recovery, no multi-hop |
| TR-F10 | Parallel dispatch (party mode) |
| TR-F11 | Sequential gating (Pike/Fowler before Done) |
| TR-F12 | Context hydration: Scout loads local + Brain |
| TR-F13 | Brooks as chair receipt pattern |
| TR-F14 | Scout recon receipt |
| TR-F15 | RuVix governance receipt |
| TR-F16 | Memory write-back on significant actions |
| TR-F17 | Reflection block to Brain + BMAD |
| TR-F18 | Error escalation to Brooks |
| TR-F19 | Pike interface review before API changes |
| TR-F20 | Fowler refactor gate before structural changes |
| TR-F21 | Bellard diagnostics before optimization claims |
| TR-F22 | Carmack performance before speed decisions |
| TR-F23 | Jobs intent gate before implementation |

### PRD-TEAM-RAM-v1: Non-Functional Requirements (6)

| ID | Requirement |
|----|-------------|
| TR-NFR1 | Routing within 30 seconds |
| TR-NFR2 | Full output traceability |
| TR-NFR3 | Autonomous governance restriction |
| TR-NFR4 | Consistent multi-agent outputs |
| TR-NFR5 | Agent failure isolation |
| TR-NFR6 | Additive agent extensibility |

### PRD Completeness Assessment

- **Totals:** 46 FRs, 13 NFRs, 12 Business Requirements across 2 PRDs
- Both PRDs have AI-assisted disclosure notices (compliant)
- Both are Draft status — not yet human-reviewed
- 5 open questions in each PRD remain unresolved

## 3. Epic Coverage Validation

### Primary FR Coverage (epics.md FR Coverage Map — FR1–FR25)

| FR | Requirement | Epic | Status |
|----|-------------|------|--------|
| FR1 | Governed write path and trace creation | Epic 1 | ✓ Covered |
| FR2 | Scoped memory search | Epic 3 | ✓ Covered |
| FR3 | Memory detail and provenance inspection | Epic 3 | ✓ Covered |
| FR4 | Scoped memory listing and state distinction | Epic 3 | ✓ Covered |
| FR5 | Governed soft-delete/recovery | Epic 1 | ✓ Covered |
| FR6 | HITL and policy-controlled promotion gates | Epic 4 | ✓ Covered |
| FR7 | Immutable semantic versioning (SUPERSEDES) | Epic 1 | ✓ Covered |
| FR8 | group_id isolation at API/schema boundaries | Epic 1 | ✓ Covered |
| FR9 | Curator decision workflow and audit receipts | Epic 4 | ✓ Covered |
| FR10 | Dashboard system/action/approval panels | Epic 2 | ✓ Covered |
| FR11 | Truthful dashboard state model | Epic 2 | ✓ Covered |
| FR12 | Approved Dashboard Visual Spec v2 shell | Epic 2 | ✓ Covered |
| FR13 | Dashboard route availability/degraded states | Epic 2 | ✓ Covered |
| FR14 | /allura remains separate until cutover | Epic 2 | ✓ Covered |
| FR15 | Cutover, rollback, parity, final release evidence | Epic 5 | ✓ Covered |
| FR16 | Notion-backed board/source-of-truth contract | Epic 1 | ✓ Covered |
| FR17 | Team RAM routing lifecycle | Epic 1 | ✓ Covered |
| FR18 | Allura Navigator loop enforcement | Epic 1 | ✓ Covered |
| FR19 | BMAD story and validation artifact system | Epic 1 | ✓ Covered |
| FR20 | Story lifecycle gates and evidence requirements | Epic 1 | ✓ Covered |
| FR21 | Phase 0 closure and Phase 1 finish criteria | Epic 5 | ✓ Covered |
| FR22 | Finish-all-epics order and closeout | Epic 5 | ✓ Covered |
| FR23 | .opencode/agent/ live source-of-truth | Epic 1 | ✓ Covered |
| FR24 | Draft PRD hardening before acceptance | Epic 1 | ✓ Covered |
| FR25 | Provenance-preserving export/copy | Epic 3 | ✓ Covered |

**Primary coverage: 25/25 FRs covered (100%)**

### PRD-DESIGN-SYSTEM-v1 Coverage Against Epics

| PRD FR | Requirement | Epic Coverage | Status |
|--------|-------------|---------------|--------|
| DS-F1–F5 | Design tokens (color, type, spacing, shadow, radius) | Epic 2 (visual spec) + Implemented | ✓ Covered |
| DS-F6 | StatusBadge | Epic 8 (wired) | ✓ Covered |
| DS-F7 | ConfidenceBar | Epic 8 (wired) | ✓ Covered |
| DS-F8 | TraceCard | Epic 8 (wired) | ✓ Covered |
| DS-F9 | EmptyState | Epic 2 Story 2.3 | ✓ Covered |
| DS-F10 | PanelDrawer | Epic 4 (curator detail) | ✓ Covered |
| DS-F11 | MemoryCard | Epic 3 + Epic 8 | ✓ Covered |
| DS-F12 | GraphTab | Epic 8 Story 8.3 | ✓ Covered |
| DS-F13 | Mission Control shell | Epic 2 Story 2.1 | ✓ Covered |
| DS-F14 | Section tabs | Epic 8 (all 6 tabs wired) | ✓ Covered |
| DS-F15 | Metric cards | Epic 2 Story 2.2 | ✓ Covered |
| DS-F16 | Activity feed | Epic 8 Story 8.2 | ✓ Covered |
| DS-F17 | Search input (hybrid) | Epic 3 Story 3.1 | ✓ Covered |
| DS-F18 | Responsive behavior | Epic 11 Story 11.6 | ✓ Covered |
| DS-F19 | Curator queue table | Epic 4 Story 4.1 / Epic 7 Story 7.1 | ✓ Covered |
| DS-F20 | Proposal detail view | Epic 4 Story 4.1 | ✓ Covered |
| DS-F21 | Action buttons | Epic 4 Story 4.2 / Epic 7 Story 7.2 | ✓ Covered |
| DS-F22 | Batch operations | **NOT FOUND** | ❌ MISSING |
| DS-F23 | Audit trail sidebar | Epic 4 Story 4.4 / Epic 7 Story 7.4 | ✓ Covered |

### PRD-TEAM-RAM-v1 Coverage Against Epics

| PRD FR | Requirement | Epic Coverage | Status |
|--------|-------------|---------------|--------|
| TR-F1 | Agent definitions as markdown | Epic 1 Story 1.2 | ✓ Covered |
| TR-F2 | Model assignments per agent | Epic 1 Story 1.2 | ✓ Covered |
| TR-F3 | Tool restrictions | Epic 1 Story 1.2 | ✓ Covered |
| TR-F4 | Skill ownership matrix | Epic 1 Story 1.2 | ✓ Covered |
| TR-F5 | Agent status tracking in Neo4j | **NOT FOUND** | ❌ MISSING |
| TR-F6 | Intent classification | Epic 1 (FR17 Team RAM routing) | ✓ Covered |
| TR-F7 | Role-first routing | Epic 1 Story 1.2 | ✓ Covered |
| TR-F8 | Task override | Implicit in routing rules | ⚠️ Implicit |
| TR-F9 | Fallback-only recovery | Epic 1 Story 1.2 | ✓ Covered |
| TR-F10 | Parallel dispatch (party mode) | Skill-based (party-mode) | ✓ Covered |
| TR-F11 | Sequential gating | Epic 1 Story 1.5 | ✓ Covered |
| TR-F12 | Context hydration | Epic 1 Story 1.4 | ✓ Covered |
| TR-F13 | Brooks chair receipt | Implicit in agent definition | ⚠️ Implicit |
| TR-F14 | Scout recon receipt | Implicit in agent definition | ⚠️ Implicit |
| TR-F15 | RuVix governance receipt | **NOT FOUND** | ❌ MISSING |
| TR-F16 | Memory write-back | Epic 1 (FR16) | ✓ Covered |
| TR-F17 | Reflection block | Epic 1 (FR17) | ✓ Covered |
| TR-F18 | Error escalation | **NOT FOUND** | ❌ MISSING |
| TR-F19 | Pike interface review | Epic 1 Story 1.5 | ✓ Covered |
| TR-F20 | Fowler refactor gate | Epic 1 Story 1.5 | ✓ Covered |
| TR-F21 | Bellard diagnostics | **NOT FOUND** | ❌ MISSING |
| TR-F22 | Carmack performance | **NOT FOUND** | ❌ MISSING |
| TR-F23 | Jobs intent gate | **NOT FOUND** | ❌ MISSING |

### Missing FR Coverage

#### From PRD-DESIGN-SYSTEM-v1
- **DS-F22 (Batch operations):** Multi-select + bulk approve/reject with confirmation modal has no explicit story. Individual approve/reject exists in Epic 4/7, but batch mode is absent.

#### From PRD-TEAM-RAM-v1
- **TR-F5 (Agent status tracking in Neo4j):** No story covers runtime agent state persistence to Neo4j.
- **TR-F15 (RuVix governance receipt):** No story tests or validates the mutate→attest→verify→isolate→sandbox→audit receipt chain.
- **TR-F18 (Error escalation to Brooks):** No story covers the agent failure escalation path.
- **TR-F21 (Bellard diagnostics gate):** No story enforces performance measurement before optimization claims.
- **TR-F22 (Carmack performance gate):** No story enforces latency analysis before speed decisions.
- **TR-F23 (Jobs intent gate):** No story explicitly validates scope control and acceptance criteria gate.

#### Implicit (Not Explicit Stories)
- **TR-F8, TR-F13, TR-F14:** These are behavioral patterns in agent definitions rather than testable stories. Low risk but not explicitly validated.

### Coverage Statistics

| Source | Total FRs | Covered | Missing | Implicit | Coverage |
|--------|-----------|---------|---------|----------|----------|
| epics.md (primary) | 25 | 25 | 0 | 0 | 100% |
| PRD-DESIGN-SYSTEM-v1 | 23 | 22 | 1 | 0 | 96% |
| PRD-TEAM-RAM-v1 | 23 | 14 | 6 | 3 | 61% |
| **Combined** | **71** | **61** | **7** | **3** | **86%** |

## 4. UX Alignment Assessment

### UX Document Status: Found (Archived)

Primary UX document: `archive/docs/design/DASHBOARD-VISUAL-SPEC-v2.md`
Supporting: `archive/docs/design/DASHBOARD-VISUAL-AUDIT-2026-05-21.md`
Epics UX requirements: `epics.md` UX-DR1 through UX-DR14

### UX ↔ PRD Alignment

| UX Requirement | PRD Coverage | Status |
|----------------|-------------|--------|
| UX-DR1: Warm cream #F5F0E8, semantic tokens | DS-F1 (color system) | ✓ Aligned |
| UX-DR2: Outfit headings, Inter body | DS-F2 (typography) | ✓ Aligned |
| UX-DR3: Search-first center | DS-F17 (search input) | ✓ Aligned |
| UX-DR4: Thin workflow nav | DS-F13 (dashboard shell) | ✓ Aligned |
| UX-DR5: Right column approvals | DS-F19 (curator queue) | ✓ Aligned |
| UX-DR6: Bottom mission board strip | **NOT in PRD** | ⚠️ Gap |
| UX-DR7: Empty states copy | DS-F9 (EmptyState) | ✓ Aligned |
| UX-DR8: Graph error states | DS-F12 (GraphTab) | ✓ Aligned |
| UX-DR9: Agent cards live/unknown | **NOT in PRD** | ⚠️ Gap |
| UX-DR10: Insights tabs (All/Pending/Approved/Rejected) | DS-F14 (section tabs) | ✓ Aligned |
| UX-DR11: Builder compose + curator | DS-F19–F21 (curator) | ✓ Aligned |
| UX-DR12: Forbidden regressions | **NOT in PRD** | ⚠️ Gap (enforcement only) |
| UX-DR13: Visual 6420 comparison | **NOT in PRD** | ⚠️ Gap (process only) |
| UX-DR14: Keyboard reachable curator | DS-NFR2 (keyboard nav) | ✓ Aligned |

### UX ↔ Architecture Alignment

| UX Need | Architecture Support | Status |
|---------|---------------------|--------|
| Warm cream theming | CSS custom properties in DESIGN-ALLURA | ✓ Supported |
| Search-first hybrid | RuVector bridge hybrid search | ✓ Supported |
| Approvals queue | Curator pipeline + API routes | ✓ Supported |
| Graph visualization | Neo4j + ForceGraph2D | ✓ Supported |
| Bottom mission board | **No backend/data model** | ❌ Not supported |
| Agent live status | **No runtime agent health API** | ❌ Not supported |
| 6420 reference comparison | CI guard script exists | ✓ Supported |

### Alignment Issues

1. **UX-DR6 (Bottom mission board strip):** Lanes Intake/Ready/Doing/Review/Done/Blocked exist in UX spec but have no backend data source. Epic 10 Story 10.2 (Kanban) partially addresses this via Notion Symphony adapter, but the mission board strip itself is not explicitly covered.

2. **UX-DR9 (Agent live status):** Dashboard Visual Spec expects agent cards with live/unknown status, but there's no runtime health API for individual agents. TR-F5 (agent status tracking in Neo4j) is also missing from epics.

3. **Visual spec is archived:** The active visual spec lives in `archive/` rather than the planning surface. Risk: it may be treated as deprecated when it's actually the active target.

### Warnings

- PRD-DESIGN-SYSTEM color system uses `--allura-deep-navy #1A2B4A` as primary, but Dashboard Visual Spec v2 uses warm cream `#F5F0E8` background with orange `#F97316` CTA. These are different design languages — the PRD reflects the older Allura brand, the visual spec reflects the v2 direction. **Potential brand token conflict.**
- Dark mode (Epic 11 Story 11.3) has no UX design spec — only acceptance criteria in the story.

## 5. Epic Quality Review

### Epic User Value Assessment

| Epic | Title | User Value? | Assessment |
|------|-------|-------------|------------|
| 1 | Team RAM Execution & Semantic Integrity | ⚠️ Borderline | Process/governance epic — user outcome is "work can move safely." Not directly user-facing but enables all other epics. Acceptable as a foundation epic. |
| 2 | Governed Dashboard Foundation | ✓ Clear | Operators get a truthful dashboard |
| 3 | Memory Provenance & Review | ✓ Clear | Operators can search, inspect, verify memories |
| 4 | Curator Workflow & Promotion Gates | ✓ Clear | Curators can safely approve/reject with receipts |
| 5 | Runtime Reliability, Cutover & Evidence | ✓ Clear | System can be released with evidence |
| 8 | Live Brain Wiring | ✓ Clear | Dashboard tabs show real data (COMPLETE) |
| 9 | Truthfulness Infrastructure | ⚠️ Borderline | "Make surfaces tell truth" is infrastructure — but the user outcome (no fake data) is real. The MCP tools are backend work that unlocks surfaces. |
| 10 | Orchestration & Runtime | ✓ Clear | Task orchestration, scheduling, chat — all user-facing |
| 11 | UX Polish Layer | ✓ Clear | Better interactions (dark mode, command palette, mobile) |

### Epic Independence Assessment

| Epic | Independent? | Issues |
|------|-------------|--------|
| 1 | ✓ Yes | Standalone foundation |
| 2 | ✓ Yes | Uses Epic 1 governance but can function alone |
| 3 | ✓ Yes | Read-only, can use existing data |
| 4 | ✓ Yes | Builds on existing curator pipeline |
| 5 | ⚠️ Final | Requires 1–4 complete or deferred — acceptable for a closeout epic |
| 8 | ✓ Yes | COMPLETE |
| 9 | ✓ Yes | Introduces new MCP tools, doesn't depend on unfinished epics |
| 10 | ❌ Forward dep | Explicitly blocked by Epic 9 completion. All 4 stories require Epic 9 DoD tests. |
| 11 | ❌ Forward dep | All stories require Epics 9+10 complete. |

### Story Quality Assessment

#### Acceptance Criteria Format

| Epic | AC Format | Quality |
|------|-----------|---------|
| 1–5 (epics.md) | Full Given/When/Then BDD | ✓ Excellent |
| 9 | Checkbox-style | ⚠️ Acceptable but not BDD |
| 10 | Checkbox-style | ⚠️ Acceptable but not BDD |
| 11 | Checkbox-style | ⚠️ Acceptable but not BDD |

#### Story Sizing Concerns

| Story | Complexity | Issue |
|-------|-----------|-------|
| 9.1 (Governance MCP) | Large | 5 new MCP tools + integration tests — may need splitting into schema + implementation |
| 9.3 (DoD Test Harness) | Large | 8 surface test files + helpers — grows with each surface. Acceptable as a living story. |
| 10.3 (Dreams Backend) | Large | CRUD + cron engine + Anthropic execution + Brain persistence — should be 2–3 stories |
| 10.4 (Chat Runtime) | Large | Streaming + history + model selection + attachments + @-mentions + conversation mgmt — should be 3+ stories |

### Dependency Analysis

#### Within-Epic Dependencies

**Epic 9:** Story 9.3 depends on 9.1 + 9.2 (tests need governance/audit tools). Stories 9.4 and 9.5 are independent quick wins. ✓ Correct ordering.

**Epic 10:** Story 10.2 depends on 10.1 (Kanban needs Notion adapter). Stories 10.1, 10.3, 10.4 are parallel after Epic 9. ✓ Correct ordering.

**Epic 11:** Story 11.4 depends on 10.2. Story 11.3 depends on 9.5. Others are parallel after 9+10. ✓ Correct ordering.

#### Cross-Epic Overlap

🟠 **Story 10.2 vs 11.4:** Reconciliation note exists — 10.2 owns data wiring, 11.4 owns interaction polish. Acceptable but must be enforced during implementation.

### Best Practices Compliance

| Check | Epics 1–5 | Epic 9 | Epic 10 | Epic 11 |
|-------|-----------|--------|---------|---------|
| Delivers user value | ✓ | ⚠️ | ✓ | ✓ |
| Functions independently | ✓ | ✓ | ❌ | ❌ |
| Stories sized correctly | ✓ | ⚠️ | ❌ | ✓ |
| No forward dependencies | ✓ | ✓ | ❌ | ❌ |
| Clear acceptance criteria | ✓ | ⚠️ | ⚠️ | ⚠️ |
| FR traceability | ✓ | ❌ | ❌ | ❌ |

### Quality Findings

#### 🔴 Critical Violations

1. **Stories 10.3 and 10.4 are too large.** Each contains 8+ features that should be separate stories. 10.3 (Dreams) combines CRUD, cron engine, execution, and result storage. 10.4 (Chat) combines streaming, history, model selection, attachments, conversation management, and error recovery. These are epic-sized stories.

#### 🟠 Major Issues

2. **Epics 9–11 lack FR traceability.** The main `epics.md` has explicit FR1–FR25 coverage map. Epics 9, 10, 11 don't map back to any FR numbering system — they're standalone planning documents without traceability links.

3. **Epics 10–11 have hard forward dependencies** on Epic 9. While the dependency graph is documented, the stories can't function independently if Epic 9 slips.

4. **Epics 9–11 use checkbox ACs** instead of BDD Given/When/Then. This makes automated validation harder and acceptance ambiguous.

5. **Story 9.1 introduces 5 new MCP tools** as a single story (Large). Recommend splitting into schema design + implementation to enable parallel review.

#### 🟡 Minor Concerns

6. **Epic numbering gap:** Epics 6 and 7 exist in `EPICS-dashboard-v2.md` but are not in the main `epics.md`. Their stories (7.1–7.4) exist in `_bmad/bmm/stories/` but governance is unclear.

7. **Retrospective files** exist for Epics 1–5 and 7, suggesting those epics are complete. No retrospective for Epic 8 (though marked complete in epic-11 renumber note).

8. **Dark mode (11.3)** has no UX design spec defining the dark color palette.

## 6. Final Assessment

### Overall Readiness Status: NEEDS WORK

Epics 1–5 and 8 are **implementation-ready** (or already complete). They have full BDD acceptance criteria, FR traceability, clear ownership, and proper story sizing.

Epics 9–11 **need refinement** before implementation. They are well-conceived but have structural issues that will cause friction during execution.

### Critical Issues Requiring Immediate Action

1. **Split Stories 10.3 (Dreams) and 10.4 (Chat Runtime).** Each is 3–4 stories compressed into one. Implementation will stall at ambiguous scope boundaries. Break along the feature table boundaries already documented in each story.

2. **Add FR traceability to Epics 9–11.** The main FR1–FR25 list doesn't cover governance MCP tools, audit tools, Dreams, or Chat. Either extend the FR numbering (FR26+) or create a separate requirement source for Epics 9–11.

3. **Resolve brand token conflict.** PRD-DESIGN-SYSTEM-v1 uses `--allura-deep-navy #1A2B4A` as primary brand color. Dashboard Visual Spec v2 uses warm cream `#F5F0E8` + orange `#F97316`. These represent two different design directions. Clarify which is canonical before Epic 11 implementation.

### High Priority (Before Sprint Start)

4. **Move Visual Spec v2 out of archive** (or update config.yaml reference). Active design targets shouldn't live in `archive/`.

5. **Convert Epics 9–11 ACs to Given/When/Then** for consistency with Epics 1–5 and automated validation.

6. **Address 7 missing PRD-TEAM-RAM FRs** (TR-F5, TR-F15, TR-F18, TR-F21–F23). Decide: add stories, defer formally, or remove from PRD.

### Medium Priority (During Sprint)

7. **Create UX design spec for dark mode** before Story 11.3 starts — dark palette, contrast ratios, component-level token mapping.

8. **Confirm mission board strip data source** (UX-DR6) — the bottom Kanban-like strip has no backend. Is it Notion-backed (Story 10.1/10.2) or separate?

9. **Confirm agent live status API** (UX-DR9) — agent cards expect live/unknown status but no runtime health endpoint exists.

### Recommended Next Steps

1. **Fix the 2 critical items** (split oversized stories, add FR traceability to Epics 9–11)
2. **Resolve the brand token conflict** with a design decision
3. **Proceed with Epic 9** as next implementation target — it unblocks everything else
4. **Defer Epics 10–11** until Epic 9 DoD tests pass (dependency chain is correct)

### Readiness by Epic

| Epic | Status | Readiness |
|------|--------|-----------|
| 1 | Complete | ✓ Done |
| 2 | Complete | ✓ Done |
| 3 | Complete | ✓ Done |
| 4 | Complete | ✓ Done |
| 5 | Complete | ✓ Done |
| 8 | Complete | ✓ Done |
| 9 | Ready | ✓ Implementation-ready (minor AC format issue) |
| 10 | Backlog | ❌ Needs story splitting before implementation |
| 11 | Backlog | ⚠️ Ready after Epic 9–10 + dark mode UX spec |

### Final Note

This assessment identified **8 issues** across **4 categories** (coverage gaps, UX alignment, story quality, traceability). The core planning (Epics 1–5, FR1–FR25) is excellent — thorough, traceable, and evidence-backed. The newer epics (9–11) are strong concepts that need the same rigor applied to story sizing and traceability before coding begins. Epic 9 is the critical path — start there.

---

**Assessor:** Brooks (Architect)
**Date:** 2026-06-07
**Report:** `_bmad/bmm/planning/implementation-readiness-report-2026-06-07.md`
