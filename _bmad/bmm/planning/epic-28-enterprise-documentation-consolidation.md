# Epic 28 — Enterprise Documentation Consolidation

> [!NOTE]
> **AI-Assisted Documentation**
> Portions of this document were drafted with the assistance of an AI language model.
> Content has been reviewed against architectural principles and should be kept in sync with source-of-truth docs.
> When in doubt, defer to code, schemas, and team consensus.

**Status:** Complete — Tasks 1–8 done. Task 8 (exit-gate closure) was scoped and executed repo-side on 2026-08-29 without a commit; see Story 28.8 and Known Gaps (now closed).
**Owner:** Brooks (orchestrator)
**Tenant:** `allura-system`
**Canonical scope:** [Notion — Allura Documentation Hub](https://app.notion.com/p/3ca1d9be65b3818c8680cef760371320?pvs=204). This file is the versioned repository planning mirror; it did not exist as a tracked artifact when the work started, which is why Task 8's scope was lost — see Known Gaps.

> **Renumbered 27 → 28 on 2026-08-28.** This epic was first drafted as Epic 27, before an
> earlier, unrelated Epic 27 proposal (`epic-27-governed-branchable-learning-memory.md`,
> authored 2026-08-26) was found sitting uncommitted on the `wip/checkpoint-2026-08-26-dirty-main`
> branch. That epic predates this one and is forward-looking architecture work, so it keeps the
> 27 slot; this consolidation record moved to 28. Story IDs were renumbered to match.

## Goal

Eliminate competing documentation authorities across the project and establish a single lifecycle: GitHub `docs/allura/` (the canonical six) is the published engineering truth; Notion is the private working surface for strategy, planning, and approvals; Superpowers is fully decommissioned as a competing workflow/doc authority. No document should have two active, disagreeing copies.

## Why now

Repo recon on 2026-08-28 found six parallel Superpowers documents plus public plugin references, and a separate Notion recon found three Allura Blueprint pages, three-to-four architecture-page candidates, and one clear Epic 26 page — all competing or duplicate authorities with no reconciliation. Architecture without a single owner per artifact turns into drift; this epic closes that gap.

## Authority model (decided)

- **Lifecycle Model A:** Notion owns private drafts/planning/approvals. After explicit approval and security sanitization, content is promoted to GitHub via PR; GitHub then becomes canonical and is maintained through PRs. No bidirectional editing, no automatic overwrite from Notion.
- **Publication gate:** Notion internal approval → privacy/security sanitization → GitHub pull request → automated documentation checks → named-owner human approval → versioned publication receipt recorded in Allura Brain.
- **Classification, not deletion:** every discovered artifact is classified canonical, merge-source, evidence, obsolete, or private. Superseded material is archived with lineage, never deleted.
- **Public doc audience:** evaluators, new users, integrators, operators/security reviewers, architecture/governance readers, contributors, reference consumers — public GitHub docs must be self-contained and free of private Notion dependencies.
- **Hosting:** the public documentation website (when built) is served from GitHub Pages, versioned with the repository, generated from the same canonical Markdown — a derived presentation layer, not a second editable copy.

## Story Map

| Story | Outcome | Status |
|---|---|---|
| 28.1 | Point BMAD working artifacts outside the canonical six (`docs(bmad)`, commit `0b6c0539`) | Done |
| 28.2 | Archive Superpowers planning surface to `docs/archive/allura/superpowers/` with lineage README (`docs(superpowers)`, commit `04fd32a6`) | Done |
| 28.3 | Remove active Superpowers extension references from `docs/plugins/index.md` and `docs/user-guide/codex.md` (`docs(plugins)`, commit `ba5c26bc`) | Done |
| 28.4 | Add documentation authority map for tier-0 hydration (`docs(context)`, commit `e602c0a6`) | Done |
| 28.5 | Enforce adaptive hydration token budget for Brooks — 3,000 token startup / 8,000 cumulative cap (`docs(agent)`, commit `ab77c1f7`) | Done |
| 28.6 | Scaffold GitHub Pages publication for the canonical six (`ci(docs)`, commit `020b3509`) | Done |
| 28.7 | Notion consolidation — build one internal Documentation Hub, classify and archive duplicate Blueprint/Architecture/Brand-guide pages, link surviving pages to published GitHub docs | Done — verified 2026-08-28; see Verification below |
| 28.8 | Exit-gate closure — canonical Notion Blueprint page body reconciled to PostgreSQL-only per AD-50 / Epic 23, scratch artifacts dispositioned, residue guard verified green | Done — repo-side evidence, no commit (see Story 28.8) |

All Story 28.1–28.6 commits landed on `feat/epic-26-story-26.7-upstream-plugin` and merged to `main` via PR #126 (merge commit `7f649b7f`).

## Verification (28.7)

Notion "📚 Allura Documentation Hub" (`3ca1d9be-65b3-818c-8680-cef760371320`) exists with a full Decision Log and an `[ARCHIVED]`-prefixed Archive child page:

- **Allura Blueprint:** 3 pages found → 1 canonical (`be31d9be`) + 2 archived with lineage notices.
- **Allura Memory — Engine / architecture:** 4 candidates found (one more than the expected three; a Faith Meats operating-system page was correctly excluded as out-of-tenant) → 1 canonical (`33b1d9be`) + 3 archived.
- **Allura Brand Style Guide:** 2 pages found → 1 canonical, 1 archived (content-identical recovery snapshot).

Nothing was deleted or trashed; every superseded page carries a lineage notice pointing to its replacement and the published GitHub doc. This matches the classify-and-archive decision exactly.

A prior Brain trace (`memory_id 325d0de4`, logged 2026-08-28T12:27:43Z) incorrectly recorded Task 7 as "dispatched then user-cancelled, not completed" — the Notion page edit timestamps (12:28–12:34Z) are *after* that trace, meaning the dispatched work kept running past the status note and actually finished. Corrected in Brain trace `memory_id` from `memory_add` call at 2026-08-28T13:07:12Z.

## Known Gaps

> Both gaps below were closed on 2026-08-29 by Story 28.8 (exit-gate closure). Records are preserved here for lineage; they are historical, not open items.

1. **Task 8 was undefined. ✅ Resolved by Story 28.8 (2026-08-29).** No Brain trace named its scope. The design/plan documents that would have enumerated it — `_bmad-output/planning-artifacts/2026-08-28-enterprise-documentation-consolidation-{design,plan}.md` and `implementation-readiness-report-2026-08-28.md` — originally lived only in a gitignored scratch directory. The readiness report has since been recovered and archived at `docs/archive/allura/readiness/implementation-readiness-report-2026-08-28.md`. On 2026-08-29 the scratch directory was confirmed to contain only `test-artifacts/`; the design/plan originals are gone (never tracked, no backup copy on this machine or in any repo worktree), so they cannot be archived — this file is the durable scope record. Task 8 was scoped as **exit-gate closure**: (a) reconcile the canonical Notion Blueprint page body with AD-50 / Epic 23 (PostgreSQL-only; Neo4j fully sunset), (b) disposition the scratch artifacts (archived where they existed; absence documented where they did not), (c) prove no active-doc Neo4j residue via the docs guard. See `_bmad/bmm/stories/28-8-exit-gate-closure.md` for the full record, including the Notion-write evidence.
2. **Stale content in the canonical Notion Blueprint page. ✅ Resolved by Story 28.8 (2026-08-29).** `be31d9be` (selected as canonical by Task 7) described Neo4j as a canonical dual-store alongside PostgreSQL in its body text even though its own supersession banner cites AD-50 (PostgreSQL is now the sole active durable store; Neo4j is sunset — see also Epic 23, which removed Neo4j from the codebase entirely). Task 7 correctly picked *which* page is canonical; it did not rewrite stale body content. Story 28.8 replaced the page body's dual-store/canonical-now sections with a PostgreSQL-only architecture statement per AD-50/Epic 23 (verified via Notion API response `id be31d9be-65b3-828c-b46e-81b1d1078f3a`); the AD-50 supersession banner, brand tokens, authority-map, and references were preserved; the removed dual-store prose was archived in Notion under the Hub's Archive page as `[ARCHIVED] Allura Blueprint — legacy dual-store body (superseded 2026-08-29)`.

## Exit Gate

- [x] Superpowers fully decommissioned as an active repo authority (docs archived, references removed, machine-global install left untouched per original scope).
- [x] BMAD working artifacts point outside the canonical six.
- [x] Tier-0 hydration authority map and Brooks token budget in place.
- [x] GitHub Pages publication scaffold exists for the canonical six.
- [x] Notion has exactly one active copy per artifact (Blueprint, Engine/Architecture, Brand Style Guide), each linked to its published GitHub counterpart, with superseded copies archived not deleted.
- [x] Task 8 scoped and completed (Story 28.8 — exit-gate closure; repo-side evidence, no commit; Notion Blueprint body reconciled + archived legacy body, scratch artifacts dispositioned, residue guard green).
- [x] Canonical Notion Blueprint page body reconciled with AD-50 / Epic 23 (PostgreSQL-only) — written 2026-08-29 via Notion API, verified by read-back (see Story 28.8 Evidence).