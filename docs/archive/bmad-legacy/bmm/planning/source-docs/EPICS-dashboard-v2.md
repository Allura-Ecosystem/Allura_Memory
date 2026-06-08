# Epics — Allura Dashboard v2

Status: Draft execution breakdown for the approved Dashboard v2 UX target.

## Epic 1 — Phase 1 Dashboard Overview

- Build `/dashboard` vertical mission-control flow.
- Panels: system status, hygiene/actions, approvals queue.
- Preserve existing dashboard shell/navigation.

## Epic 2 — Curator Action Contract

- Wire approve/reject actions to existing curator APIs.
- Implement `requestChanges` as `Needs evidence` over reject/rationale.
- Show role/action restrictions and confirmation dialogs.

## Epic 3 — Evidence and Detail Safety

- Ensure `openEvidence` and `openDetail` never route to missing pages.
- Add or defer evidence detail routes with explicit unavailable states.

## Epic 4 — Degraded State and Shape Drift

- Surface `DashboardResult<T>` warnings and degraded responses.
- Preserve RK-17 schema-first validation warnings.

## Epic 5 — Native Kanban Architecture Track

- Execute SYM-KAN-001 through SYM-KAN-010.
- Keep separate from Phase 1 dashboard implementation.

## Epic 6 — Review and Cutover Evidence

- Run gap audit.
- Run implementation validation.
- Collect review notes, runtime evidence, rollback plan, and Captain approval.

## Epic 7 — Memory, Provenance, and Audit

Epic 7 answers: “What does Allura know, and can we prove it?”

Stories in this epic cover memory search, detail inspection, evidence chains, audit browsing, tamper evidence, and export/copy affordances.

### Story 7.7 — Copy/Export Provenance

Acceptance anchor:

> Given an allowed export or copy action, when a governed memory/audit/evidence record is copied or exported, then provenance is preserved in a human-readable format including source, actor, timestamp, tenant scope, status, confidence when present, and evidence/hash fields when present.

Story 7.7 is v2.1-deferrable for UI convenience if the underlying audit export backend remains tested and all provenance fields are visible in detail views.
