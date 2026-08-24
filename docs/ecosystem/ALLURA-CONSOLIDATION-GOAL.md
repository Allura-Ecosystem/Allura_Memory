# Allura Ecosystem Consolidation — Goal Definition

> Structured via Brooks NX→S (/define-goal) · 2026-06-12 · updated 2026-07-25 (post-RuVector cutover).
> Companion to ALLURA-CONSOLIDATION-PLAN.md. Canonical source is `allura-memory/docs/allura/BLUEPRINT.md`;
> this file mirrors it. Notion remains source of truth for planning state.

## Goal
Make `Allura-ecosystem` the single, version-controlled home for all Allura projects —
a clean, workable monorepo on `github.com/Allura-Ecosystem/team_durham` — without losing
history, breaking submodule contracts, or committing into a broken 3 GB repo. The ecosystem
rides on one governed Brain — episodic traces in PostgreSQL, semantic knowledge through the
RuVector graph adapter (AD-49 cutover, 2026-07-12) — with the Genesis Engine watching trajectories
and proposing new skills through HITL (AD-54). Self-improvement is now part of the consolidation
goal, not a separate effort: every agent run feeds the loop — raw traces → curator scores
(0.0–1.0) → Genesis Engine detects patterns → approved proposals become skills → SUPERSEDES
versioning keeps it reversible.

## Outcome (what "done" looks like)
A developer can clone the repo, run one install + one build, and work on any Allura project.
`git status` / `git add` are fast. Layout is documented and matches reality. The consolidation
move is committed and pushed. Every structural decision is logged to the Allura Brain and
mirrored to Notion. The semantic graph runs on the RuVector adapter by default
(`GRAPH_BACKEND=ruvector`), with Neo4j 5.26 retained as read-only fallback for one release
after the cutover. The Genesis Engine reads trajectories and skill-usage events to propose
skills — people approve them, never the engine.

## Scope
**In scope**
- Reconciling the repo-root-is-parent reality with the "one folder" intent.
- Diagnosing and removing the 3 GB bloat (working-tree and/or history).
- Committing the in-flight brand-maker move with rename preservation; pushing.
- Adopting a Turborepo + pnpm layout (apps / packages / tooling) on TS/Node.
- Resolving the brand-maker submodule-vs-monorepo contract.

**Out of scope (this effort)**
- Rewriting application code or business logic inside any project.
- Changing the Allura Brain schema or agent definitions.
- Draining the full 243-deep curator queue (tracked separately as ongoing).
- Native RuVector extension functions (Stage 2 — `ruvector_function_count > 0`); the graph
  adapter cutover (AD-49) uses PG tables, not the native extension. Stage 2 stays gated on
  TALON evidence per RK-21.

## Requirements
- R1. No data loss — every file accounted for before any destructive op; full `git bundle` backup taken first.
- R2. History preserved for migrated projects (subtree / `git filter-repo`, not naive copy).
- R3. Reversible per phase — each phase is its own commit; nothing irreversible without explicit approval.
- R4. `git add` / `git status` perform in < ~2s after Phase 2.
- R5. Submodule pointers either cleanly retained or cleanly converted — no dangling gitlinks.
- R6. Tooling defaults to TS/Node; runs well on Ubuntu + RTX 3070 / 32 GB.
- R7. Every architectural decision logged to Allura Brain (group_id allura-system, agent brooks-architect) and mirrored to Notion.

## Success Criteria (measurable)
- SC1. `git status` clean after the consolidation commit; commit pushed to origin.
- SC2. Repo working-tree size and/or `.git` size materially reduced (target: no tracked node_modules/build artifacts; binaries in LFS).
- SC3. `pnpm install` + `turbo build` succeed from the root.
- SC4. `turbo boundaries` passes (no cross-package import violations) for migrated packages.
- SC5. ALLURA-CONSOLIDATION-PLAN.md layout == actual on-disk layout (no drift).
- SC6. Decision log entries exist in the Brain for: bloat strategy, submodule resolution, layout adoption.

## Definition of Done
- [x] Phase 0: stale lock cleared; reorg confirmed via scoped status; brand-maker decision recorded.
- [x] Phase 1: bloat report produced; working-tree-vs-history strategy chosen and approved.
- [x] Phase 2: `.gitignore` repaired; non-tracked-worthy files un-cached; binaries in LFS; move committed with renames; pushed.
- [ ] Phase 3: apps/packages/tooling layout in place; `turbo.json` + `pnpm-workspace.yaml` committed; 2–3 pilot projects migrated with history; build green.
- [x] Phase 4: decisions logged to Brain + mirrored to Notion; plan/goal docs reflect final state.
- [ ] Sign-off (SO) on each phase boundary before proceeding to the next.
- [x] RuVector graph cutover (AD-49, 2026-07-12): `GRAPH_BACKEND=ruvector` is production default;
  Neo4j 5.26 retained as read-only fallback for one release. See
  `allura-memory/docs/allura/RISKS-AND-DECISIONS.md` AD-49 and Story 19.3.
- [x] Genesis Engine foundation (AD-51/52/53/54/55, 2026-07-17): SONA trajectory recording,
  skill-usage telemetry, coherence monitor, genesis pattern detector, and self-healing
  accepted for native build under HITL gates. Epic: `epic-level-4-pattern-learning.md`.

## Assumptions (state + verify)
- A1. The 3 GB is mostly tracked node_modules/build/binaries (verify in Phase 1). If it's deep history instead, Phase 2 shifts toward `filter-repo`.
- A2. brand-maker should be folded into the monorepo (your "one folder" intent) — pending your confirmation.
- A3. `pnpm` is acceptable as the package manager — pending your confirmation.
- A4. The workspace bash I/O timeouts are environmental (large mount), not repo corruption — verify with a successful read-only Phase 1 run.

## Open Decisions (block Phase 2/3)
1. brand-maker: fold into monorepo (recommended) vs. keep as submodule.
2. Bloat fix: history rewrite (`filter-repo`) allowed, or working-tree cleanup only?
3. Package manager: adopt `pnpm` (recommended) vs. stay current.

## Owner / Team
- Architect (owner): Brooks — layout, contracts, sign-off gates.
- Execution: Woz (build), Hightower (CI/LFS), Knuth (bloat inventory), Fowler (migration gate).
- One-hand rule (Brooks's Law): the restructure is not parallelized across many contributors.
