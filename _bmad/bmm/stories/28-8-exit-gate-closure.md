# Story 28.8 — Exit-Gate Closure (Notion Blueprint reconciliation + scratch-artifact disposition + residue verification)

**Epic:** 28 — Enterprise Documentation Consolidation
**Status:** done (repo-side evidence only; no commit — parent reconciles sprint status)
**Priority:** P1
**Complexity:** Medium
**Owner:** subagent (Epic 28 closeout workstream)
**Dependencies:** Tasks 28.1–28.7 (merged via PR #126); Epic 23 (PostgreSQL (graph_memories) sunset); AD-50 (PostgreSQL sole durable store)

## Outcome

Close Epic 28's exit gate. The two open exit-gate items are closed:

1. **Task 8 scoped and completed** — scoped as *exit-gate closure*: reconcile the canonical Notion Blueprint page body with AD-50 / Epic 23 (PostgreSQL (graph_memories) fully sunset; PostgreSQL sole durable store), disposition the remaining design/plan scratch artifacts, and verify no active-doc PostgreSQL (graph_memories) residue remains.
2. **Canonical Notion Blueprint page body reconciled** — the body of canonical page `be31d9be-65b3-828c-b46e-81b1d1078f3a` was rewritten to a PostgreSQL-only architecture statement and verified by API read-back. The removed legacy dual-store prose was archived (classification, not deletion) as a child page of the Hub's Archive page.

## Acceptance Criteria

- [x] AC-1: Task 8 is defined in the Epic 28 planning doc (`_bmad/bmm/planning/epic-28-enterprise-documentation-consolidation.md`) as exit-gate closure, and the Story Map row for 28.8 is marked Done.
- [x] AC-2: Story record `_bmad/bmm/stories/28-8-exit-gate-closure.md` exists with Outcome, Acceptance Criteria, and Evidence (this file).
- [x] AC-3: `docs-backend-residue-guard.sh` run twice (pre/post-scope) exits 0 — no neo4j-as-current residue in active docs (`docs/allura`, `docs/enterprise`, `docs/portfolio`, `README.md`) or tracked runtime surfaces (`.opencode/agent`, `.claude/agents`, `.agents`). Guard output: `docs-backend-residue-guard: OK — no retired backend residue in active surfaces` (exit 0). **No active-doc fixes were required.**
- [x] AC-4: Scratch artifacts dispositioned. `_bmad-output/planning-artifacts/2026-08-28-enterprise-documentation-consolidation-{design,plan}.md` are confirmed **absent** from the machine (directory contains only `test-artifacts/`; nothing in repo worktrees or `$HOME`); they were gitignored originals that were never tracked and have no backup, so nothing can be archived — their absence and this repo file's role as the durable scope record are documented in the planning doc. The recovered readiness report at `docs/archive/allura/readiness/implementation-readiness-report-2026-08-28.md` is confirmed present and untouched.
- [x] AC-5: Canonical Notion Blueprint page body reconciled with AD-50 / Epic 23 (PostgreSQL-only) — **written via Notion API and verified by read-back** (not pending). Legacy body archived, not deleted.
- [x] AC-6: Exit-gate checkboxes in the planning doc updated: both previously-unchecked items now `[x]`.
- [x] AC-7: No commit made; only files under the Epic-28 file-disjoint allow-list touched (planning doc + story file; `.github/scripts/` and `docs/archive/**` read-only/untouched).

## Out of Scope

- Committing changes (parent reconciles sprint status).
- Editing `sprint-status.yaml`, Epic 27 story files, `src/**`, or `docker/**` (file-disjoint rule).
- Rewriting archived history (`docs/archive/**` preserved verbatim).
- The future publication-gate CI workflow (hypothesized Task-8 scope in the old Known Gaps entry) — out of scope by design; the actual exit-gate items are the ones closed here.

## Context

- The Epic 28 planning doc's Known Gaps listed Task 8 as undefined and the canonical Notion Blueprint page body (`be31d9be`, selected by Task 28.7) as still describing PostgreSQL (graph_memories) as a canonical dual-store.
- AD-50: PostgreSQL is the sole active durable store (PostgreSQL (graph_memories) sunset). Epic 23 (2026-07-17) removed PostgreSQL (graph_memories) from the codebase. RUVIX/RuVector semantic retrieval lives in PostgreSQL.
- The docs-backend-residue-guard (Story 24.8 AC-9) enforces that ACTIVE docs never describe the retired backend as current; archived/decision-log references are deliberately allowed.

## Implementation / Actions Taken

1. **Verified repo state:** branch `develop` @ `cb16f1a8`, clean worktree.
2. **Scoped Task 28.8** in the planning doc: exit-gate closure (Outcome above), updated Story Map row, closed both Known Gaps entries (marked resolved with lineage note), and checked both exit-gate boxes with evidence pointers.
3. **Ran the residue guard:** `bash .github/scripts/docs-backend-residue-guard.sh` → exit 0 (before and after all edits; no active-doc fixes needed — this matches the guard having shipped green in Story 24.8).
4. **Dispositioned scratch artifacts:** confirmed `_bmad-output/planning-artifacts/2026-08-28-enterprise-documentation-consolidation-*` do not exist anywhere on this machine or in repo worktrees (`find` over repo + `$HOME`; `ls _bmad-output/planning-artifacts/` → missing; only `_bmad-output/test-artifacts/` remains). The original design/plan files were gitignored and never tracked, so they are unrecoverable; absence documented in the planning doc. Readiness report confirmed archived at `docs/archive/allura/readiness/implementation-readiness-report-2026-08-28.md` (untouched).
5. **Reconciled the Notion Blueprint page** — Notion API access WAS available in this environment (`NOTION_API_KEY` in `~/.hermes/.env` + `ntn` CLI 0.16.0):
   - Archived the legacy body: created child page `[ARCHIVED] Allura Blueprint — legacy dual-store body (superseded 2026-08-29)` (`3cb1d9be-65b3-8172-b882-ead679a413ff`) under the Hub's Archive page (`3ca1d9be-65b3-81d2-a5d5-e31f2c171c1d`), containing the full 12,919-char pre-write body (verified by read-back).
   - Replaced the canonical body via `PATCH /v1/pages/{be31d9be…}/markdown` with `replace_content` (per the 2026-03-11 API spec): PostgreSQL/RuVector single-store statement, preserved the AD-50/AD-57 supersession banner, brand tokens, authority map, sync contract, and references; removed all dual-store/canonical-now PostgreSQL (graph_memories) claims.
   - Verified by read-back: 12,706 chars; all stale dual-store patterns absent; PostgreSQL-only statements and preserved sections present; `truncated: false`, no `unknown_block_ids`.
   - Confirmed the page has zero `child_page`/`child_database` blocks (226 content blocks enumerated, nothing structural deleted).

## Evidence

1. **Guard output (both runs, exit 0):**
   ```
   docs-backend-residue-guard: checking active docs + runtime surfaces for retired backend residue
   docs-backend-residue-guard: OK — no retired backend residue in active surfaces
   ```
2. **Notion write (reconciled body)** — canonical page `be31d9be-65b3-828c-b46e-81b1d1078f3a` `PATCH …/markdown` returned `page_markdown` (`truncated: false`, `unknown_block_ids: []`, length 12,706). Read-back grep: `dual-store architecture` → absent; `PostgreSQL (graph_memories) remains the canonical` → absent; `Neo4j 5.26` → absent; `PostgreSQL is the sole active durable store` → present; `Neo4j was sunset` → present; `Epic 23` → present; `## Brand Tokens` / `## Documentation Authority` / `## References` / `AD-57` / `AD-50` → present.
3. **Notion archive write** — child page `3cb1d9be-65b3-8172-b882-ead679a413ff` under Hub Archive, legacy body 12,919 chars verified present (`has legacy dual-store body: True`).
4. **Notion access path:** `NOTION_API_KEY` env + `ntn` CLI (Notion skill's preferred path). Archive + canonical write both rc 0 with read-back verification — **not** pending; no HITL note required for this session.
5. **Repo state:** `develop` @ `cb16f1a8` (clean before edits). Post-work `git status` shows exactly the two files listed below, both **uncommitted** — no commit was made, per the task instruction (parent reconciles sprint status).

## Files Created / Modified (uncommitted)

- `_bmad/bmm/planning/epic-28-enterprise-documentation-consolidation.md` — modified (Status line, Story Map row 28.8, Known Gaps resolution notes, exit-gate checkboxes).
- `_bmad/bmm/stories/28-8-exit-gate-closure.md` — created (this file).

## Definition of Done

- [x] Residue guard exits 0.
- [x] Planning doc exit-gate checkboxes updated (both unchecked items now checked).
- [x] Story file valid markdown with Outcome / Acceptance Criteria / Evidence.
- [x] Notion Blueprint body reconciled per AD-50 / Epic 23 (written + read-back verified; legacy body archived).
- [x] No commits.
