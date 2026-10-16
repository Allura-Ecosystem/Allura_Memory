# Epic 30 — Focused Course Correction

Date: 2026-09-17. Owner: Brooks. Mode: batch/low-token. Status: **implemented and locally verified; no push performed.** Scope: moderate integration correction, no product scope reduction.

## Issue and impact

Cleanup consolidated the project into one checkout. The user explicitly chose local `main`; commits `e8a32728` and `3d504117` are included by fast-forward. The bounded reader and interrupted repairs are now integrated selectively. The prior `main...develop` comparison covered 313 files, including substantial Epic 29 work; those unrelated changes were not merged. Local `main` therefore remains intentionally one commit behind `origin/main` (`1934d211`), whose 266-file payload contains that excluded baseline.

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
| Code integration | Saved candidate assumed current | Approved bounded files and repairs integrated on `main`; unrelated Epic 29 changes excluded |

## Handoff and success criteria

### Inspected integration boundary

The integrated set includes `src/lib/digital-brain/`, the My Work component/CSS/tests, the guarded dashboard route and route tests, migration 71, synthetic fixtures, Epic 30 scripts and tests, `scripts/epic30/verify-reader.cjs`, the dedicated live runner/config and its CI workflow. Shared edits are limited to app-role connection options, tenant-table inventory, package scripts and the unit-test inventory.

Shared integration points require selective review: dashboard route and scope guard, tenant transaction/table inventory, PostgreSQL app-role connection options, package scripts, test-lane configuration and CI. The reader imports the tenant transaction and app pool; its migration contract test imports the tenant table inventory. The saved dashboard route replaces the normal overview with unavailable outside local mode, so it must not be adopted unchanged. Current authorization documents require preserving the normal governed route outside explicit synthetic mode.

Excluded from a blind port: device-pairing implementation and migrations, portal changes, credential-scan jobs, unrelated graph/membership changes, archived evidence, and old `_bmad/bmm` planning paths. This is a candidate boundary, not proof of dependency closure: migration ordering and transitive dependencies still need inspection before an exact approved patch set can be named. No saved implementation was copied during this inventory.

Brooks owns the dependency inventory and scope. One developer performs the approved integration in this checkout; targeted independent review checks security and compatibility. Sabir approves the exact design/variances and unresolved policy decisions. No production changes or push are authorized here.

Fresh typecheck, 78 focused tests and the non-database ordinary-route browser check pass. Live credentials and hosted execution remain pending by user choice. Design, authorization-policy and board approvals remain the next gates before story advancement.

Checklist: trigger/evidence and story impacts identified; requirements consolidated; documentation conflicts reconciled; alternatives assessed; sprint statuses preserved; bounded integration and local verification complete. Open: exact design approval, authorization-policy approval and human-board reconciliation. Repository gate passes; story acceptance and release readiness are not claimed.
