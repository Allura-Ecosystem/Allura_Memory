# Allura Ecosystem — Consolidation Plan (ADR-draft)

> AI-drafted with research assistance (Exa + Context7). Source of truth is Notion;
> this file is a mirror per the standing decision (mem-33e1d9be65b38174).
> Authored under the Brooks (Chief Architect) persona · 2026-06-12 · updated 2026-07-25.
> Canonical architecture reference: `allura-memory/docs/allura/BLUEPRINT.md`.

## TL;DR (the decision I want)

Make `Allura-ecosystem` the **one home** for everything (your stated intent), but fix the
structural truth first: the real Git repo root is the **parent** `Projects/` folder, the
repo is **3 GB+** and can't even `git add` without timing out, and a reorg is sitting
**half-committed**. We finish the move safely, then tame the repo so it's workable, then
adopt a Turborepo monorepo layout so the projects share tooling without fighting Git.

Phased, reversible, no big-bang. One architect's hand on the layout — conceptual integrity.

**Status (2026-07-25):** Phases 0, 1, 2, and 4 are **DONE**. Phase 3 (Turborepo layout
adoption) remains open and is no longer the priority — the ecosystem map is the source-of-truth
index and individual repos ship independently. The final structural step was the **RuVector
graph cutover (AD-49, 2026-07-12)**, which collapsed the semantic layer onto PostgreSQL tables
behind the `IGraphAdapter` seam and retired Neo4j 5.26 from the production path (AD-50,
2026-07-17).

## Current State (hydrated, verified)

| Fact | Detail | Source |
| --- | --- | --- |
| Git repo root | `/media/.../Projects` (parent), NOT `Allura-ecosystem` | `git rev-parse --show-toplevel` |
| Remote | `github.com/Allura-Ecosystem/team_durham.git` | `git remote -v` |
| Reorg state | brand-maker moved into `Allura-ecosystem/` (1377 files, nothing lost); 555 deletions + 16 untracked new homes; README + `allura-memory` submodule pointer modified; **uncommitted** | `git status` |
| Nested submodules | 5: `allura-plugins`, `Agent-Harnesses/Allura-TeamRam`, `allura-memory`, `Client-Projects/mortgage-audit`, `.github-public` | `find .git` |
| Repo size | 3 GB+ (`allura-memory` 1.6G, `Client-Projects` 1.3G) | `du -sh` |
| Symptom | `git add -A` times out (>45s); stale `index.lock` from an interrupted run | observed twice |
| Brain | Postgres + Neo4j healthy; semantic graph **thin** (1 promoted memory), curator queue **243 pending** | `audit_health_report` |

**Werewolf:** this looks like "tidy a folder." It's actually a 3 GB repo with submodule
contracts and a half-done move. The hidden complexity is the repo, not the folder.

## Team RAM — Party Mode (each voice, then synthesis)

- **Scout (recon):** Graph is stale — trust the work tree. Reorg is real and safe (files
  copied, not lost). Remote already points at the Allura-Ecosystem org, so the GitHub home
  is correct.
- **Torvalds (critique):** A 3 GB repo where `git add` times out is a broken workflow, full
  stop. Don't commit *more* into it until you know *why* it's huge. Almost certainly tracked
  `node_modules` / build output / binaries that should never have been committed.
- **Knuth (data architect):** Inventory before you act. Measure what's eating the 3 GB —
  largest objects in history vs. largest files on disk. The fix differs: bloated *history*
  needs `git filter-repo`; bloated *working tree* needs `.gitignore` + `git rm --cached`.
- **Carmack / Bellard (perf):** `git add .` walks the whole tree; `git add -u` only touches
  tracked files and is far faster. Enable `core.fsmonitor` + `core.untrackedCache`. On a
  3070/32 GB box this should be sub-second once the tree is clean.
- **Pike (interfaces):** Folding a former submodule into the superrepo changes a contract.
  Decide deliberately: monorepo (subtree-style, files in tree) vs. keep submodules. Don't let
  an accidental copy make that decision for you.
- **Hightower (devops):** Whatever the layout, CI clones must be `--depth=1` / `--filter=blob:none`,
  and large binaries belong in Git LFS. Lock it in once, not per-project.
- **Fowler (refactor gate):** Migrate incrementally. Preserve history with subtree/filter-repo.
  Prove the tooling on 2–3 projects before converting all of them.

### Synthesis (Brooks)

Essential complexity: many related Allura projects that *should* share types, config, and a
release rhythm → a **monorepo is the right shape** (Atlassian/GitHub guidance: monorepo fits
a small team with tightly-coupled projects and shared code). Accidental complexity: a bloated
repo and a half-done move. We remove the accidental complexity first, then impose a clean
structure.

## The Plan — 4 phases (each independently shippable & reversible)

### Phase 0 — Stabilize (DONE · 2026-06-12)
- ✅ Cleared the stale `index.lock` (root cause: interrupted `git add`; 0 bytes, no live process).
- ✅ Used scoped `git status --porcelain` to confirm the reorg.
- ✅ Decided submodule-vs-monorepo for brand-maker (folded in).

### Phase 1 — Diagnose the 3 GB (DONE · 2026-06-12)
- ✅ Largest tracked paths on disk + largest objects in history inventoried.
- ✅ Confirmed tracked `node_modules`, build artifacts, and media were the bloat.
- ✅ Output: bloat report → working-tree cleanup (`.gitignore` + `git rm --cached`), not history rewrite.

### Phase 2 — Slim & commit the move (DONE · committed as `dd9732e` 2026-06-14)
- ✅ Added/repaired `.gitignore` (node_modules, dist, .next, .turbo, caches, large binaries).
- ✅ `git rm -r --cached` on anything that shouldn't be tracked (files kept on disk).
- ✅ Moved large binaries to **Git LFS**.
- ✅ Staged with rename detection so the brand-maker move shows as renames, reviewed, **committed**.
- ✅ Pushed to `github.com/Allura-Ecosystem/Alluradesign-teamdurham`.

### Phase 3 — Impose Turborepo layout (OPEN · deprioritized 2026-07-25)
- The ecosystem map (`Allura-ecosystem`) is now the source-of-truth **index**, not a code
  monorepo. Individual repos (`Allura_Memory`, `allura-team-ram`, `allura-plugins`,
  `allura-team-durham`, `agent-backups`, `open-design`, `mortagate`) ship independently with
  their own release cycles. The Turborepo apps/packages/tooling layout is no longer the
  target — it's parked unless shared TS tooling becomes a real cost.
- If revisited, the structure under `Allura-ecosystem` would be:
  ```
  apps/        # deployable: allura-brandmaker, ai-agents, client apps
  packages/    # shared: memory, agent-harnesses, config-*, types
  tooling/     # factory, scripts, mcp harnesses
  turbo.json + pnpm-workspace.yaml + minimal root package.json
  ```

### Phase 4 — Wire to Allura mission control (DONE · ongoing curator work separate)
- ✅ Logged the layout decision + each phase outcome to the Allura Brain.
- ✅ Kept Notion as source of truth; mirrored this plan there.
- 🟡 The 243-deep curator queue is tracked separately as ongoing work — not a consolidation blocker.
- ✅ **Final structural step — RuVector graph cutover (AD-49, 2026-07-12):**
  `GRAPH_BACKEND=ruvector` is the production default, backed by PostgreSQL tables
  (`graph_memories`, `graph_supersedes`, `graph_structural_nodes`, `graph_structural_edges`)
  behind the `IGraphAdapter` seam. Neo4j 5.26 is retained as read-only fallback for one
  release (AD-50 formalized the sunset on 2026-07-17). 14/14 parity checks green
  (Story 19.3). This collapses two stores toward one engine and removes the per-person
  Neo4j Community license wall. See `allura-memory/docs/allura/RISKS-AND-DECISIONS.md`
  AD-49 and `docs/archive/allura/AD-49-ruvector-graph-cutover.md`.

## Risks & Mitigations
- **History rewrite (filter-repo)** is destructive → take a full `git bundle` backup first; do it on a clone.
- **Submodule pointers** can break on restructure → record commit SHAs before moving; re-add cleanly.
- **LFS migration** rewrites history → coordinate so any other clones re-clone after.
- **Brooks's Law:** this is a one-architect job; don't parallelize the restructure across many hands.

## Open Decisions (need your call)
1. ~~brand-maker: fold into monorepo (recommended) vs. keep as submodule.~~ **Resolved**: folded in (Phase 2).
2. ~~Repo bloat: are we allowed to rewrite history (`filter-repo`) or working-tree cleanup only?~~ **Resolved**: working-tree cleanup only (Phase 1/2).
3. ~~Package manager: `pnpm` (recommended for monorepos) vs. stay on current.~~ **Moot**: Turborepo layout deprioritized; each repo picks its own tooling.
4. **Open**: whether to revive Phase 3 (Turborepo) if shared TS tooling cost grows. Currently not worth the churn.
