# Epic 30 — Development Readiness

Date: 2026-09-17. Verdict: **REPOSITORY GATE PASS; STORY ADVANCEMENT HOLD — design and authorization-policy approvals remain open.**

## Reconciled state

- Canonical checkout: `Allura_Memory`, local branch `main`, as explicitly requested by the user.
- BMAD output normalization committed as `e8a32728`; installed tooling remains in `_bmad`.
- Four Epic 30 planning documents and 13 backlog stories recovered into `_bmad_output`; consolidated [PRD](./epic-30-prd.md) and [course-correction proposal](./sprint-change-proposal-2026-09-17.md) now document the preparation baseline and proposed integration boundary.
- User approved preserving all 83 existing tracking entries and adding Epic 30 plus 13 stories as backlog, retrospective optional. Installed BMAD generator/validator confirmed this; metadata and action items preserved.
- This is a preparation checkpoint, not a release or story acceptance. `main` was fast-forwarded to preparation commits `e8a32728` and `3d504117`. No push or whole-`develop` merge was performed.
- The bounded Epic 30 reader foundation and interrupted repair set are integrated in the canonical checkout. Unrelated Epic 29/device-pairing, portal, graph and membership changes from `develop` were excluded.
- Local `main` is intentionally one commit behind `origin/main`: remote commit `1934d211` changes 266 files and contains the excluded Epic 29/device-pairing baseline. It was inspected but not merged or pushed under this Epic 30-only cleanup authority.
- The ordinary `/dashboard` overview remains active unless explicit non-production Epic 30 synthetic mode is enabled. Synthetic failure remains unavailable without leaking connection or scope details.
- A dedicated `.github/workflows/epic-30-evidence.yml` runs the confined PostgreSQL/HTTP lane on pull requests or manual dispatch without uploading dashboard/test payloads.
- The current Obsidian-inspired Allura workspace candidate and 1440/320 px screenshots are hash-bound in the [design approval packet](./epic-30-design-approval-packet.md). This is an approval request, not approval.
- The canonical Notion human board now contains one Epic 30 record, all 13 stories, and the optional retrospective record, all `Not Started`, with verified dependency relations. Exact IDs, the schema-safe linkage disposition, and read-back evidence are recorded in the [board reconciliation packet](./epic-30-board-reconciliation-packet.md). No story was advanced.

## Fresh local evidence

- `bun run typecheck`: PASS.
- Focused Epic 30 unit and hermetic integration set: PASS, 78 tests across 9 files.
- Focused Epic 30 unit lane rerun on 2026-09-17 against `61205626`: PASS, 78 tests across 9 files. This reconfirms the explicit non-null department guard, exact-scope row rechecks, ordinary-dashboard preservation, confined 5444 runner contract, owned-process cleanup, responsive comparison behavior, and focus restoration. It is local hermetic evidence only; it does not replace the pending disposable-PostgreSQL/HTTP lane.
- Ordinary-route headless Chromium check at 1440px: HTTP 200, truthful degraded state with the database intentionally unavailable, synthetic workspace absent, zero page errors.
- The 320px ordinary dashboard shell exhibited pre-existing horizontal overflow. The repaired Epic 30 component now has current 1440/320 px synthetic visual evidence plus component coverage; live restricted-database browser proof, screen-reader proof, and real 200% zoom proof remain pending.
- Workflow/package parsing and missing-prerequisite behavior: PASS; the live runner exits 64 when required settings are absent.

Live PostgreSQL/HTTP verification remains pending by the user's explicit choice. Approved test credentials are unavailable; do not discover credentials or alter configuration. Hosted CI has not run. Five-human usability evidence, publication and release gates remain later Epic completion work; they are not substituted by local tests. The previously reviewed nullable-department, ordinary-route, and 5444-CI wiring defects are repaired and covered locally; their live and hosted execution gates remain open.

## Before implementation stories advance

1. Approve the exact provisional design artifact and declared variances; tabs, authorized search/relationships, real read-only Ask and restricted contractor messaging remain future stories.
2. Approve or amend the [hash-bound authorization packet](./epic-30-authorization-approval-packet.md) and its [local authorization contract](./epic-30-local-authorization-contract.md); accepted defaults are represented, while production timings and full enforcement still require review.
3. **Complete:** the 13 local backlog stories, Epic, and optional retrospective are reconciled with the canonical human board; see the [hash-bound receipt](./epic-30-board-reconciliation-packet.md).

## Next BMAD action

Course correction and repository integration are complete. Next: obtain the three approvals above, then run **[SP] Sprint Planning — `bmad-sprint-planning`** readiness reconciliation. After that gate passes, use **[BD] Build — `bmad-build`**, one story at a time.

The [Epic 30 plan](./epic-30-governed-digital-brain-workspace.md) owns requirements and dependencies. Recovered historical evidence is context, not a current pass.
