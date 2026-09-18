# Epic 30 — Focused Course Correction

Date: 2026-09-17. Owner: Brooks. Mode: batch/low-token. Status: preparation changes authorized; proposed code integration awaits approval. Scope: moderate integration correction, no product scope reduction.

## Issue and impact

Cleanup consolidated the project into one checkout. The user explicitly chose `main`; commits `e8a32728` and `3d504117` are now included by fast-forward. The saved reader is not integrated. The prior `main...develop` comparison covered 313 files, including substantial Epic 29 work; a whole-branch merge would not be a bounded Epic 30 repair. Uncommitted reader changes remain recoverable in mount-local Trash.

Stories 30.1–30.3 own baseline, design and authorization decisions; 30.4–30.10 depend on them. Stories 30.11–30.13 retain integrated proof, actual human study and release gates. No epic is removed, renumbered or declared complete. Epic 29 acceptance remains independent.

## Recommended approach and edits

Direct adjustment is preferred over rollback of useful cleanup or reducing the accepted MVP. Documentation effort/risk is low; dependency reconciliation is medium and must precede any implementation estimate.

| Artifact | Before | After / required action |
| --- | --- | --- |
| Checkout authority | Retired worktree / readiness branch | User-selected `main`; one checkout, no new worktrees |
| Requirements | No dedicated PRD | Consolidate existing accepted scope, without inventing requirements |
| Invitation contract | Department/channel owner substituted for project owner | Exact accepted pair: project owner and workspace membership administrator |
| Local dashboard rule | Unavailable outside local mode | Preserve ordinary governed overview; explicit local failures remain unavailable |
| Story evidence | Historical candidate could appear current | All 13 stories identify current backlog/preparation state and dependencies |
| Code integration | Saved candidate assumed current | Inventory exact files/dependencies, preserve unfinished changes outside Trash, then port only the approved set |

## Handoff and success criteria

Brooks owns the dependency inventory and scope. One developer performs the approved integration in this checkout; targeted independent review checks security and compatibility. Sabir approves the exact design/variances and unresolved policy decisions. No production changes or push are authorized here.

Next proposed task: preserve the unfinished patch in Git-owned recovery storage; inventory Epic 30 and necessary shared dependencies; present the integration set before porting. Fresh tests/typecheck, ordinary-route checks and independent review must follow integration. Live credentials remain pending by user choice.

Checklist: trigger/evidence and story impacts identified; requirements consolidated; documentation conflicts reconciled to accepted intent; alternatives assessed; sprint statuses preserved. Open: code integration approval, full design artifact/approval, authorization review and human-board reconciliation. No readiness PASS is claimed. Approve this bounded integration approach before implementation handoff.
