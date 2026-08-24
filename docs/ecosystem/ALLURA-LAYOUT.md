# Allura Ecosystem — Layout & README Plan

> Brooks (Chief Architect) · 2026-06-12 · updated 2026-07-25 (post-RuVector cutover).
> Companion to ALLURA-CONSOLIDATION-PLAN.md + ALLURA-CONSOLIDATION-GOAL.md.
> Canonical architecture reference: `allura-memory/docs/allura/BLUEPRINT.md`.
> **Status:** The consolidation move is DONE (Phases 0/1/2/4). The Turborepo apps/packages/tooling
> layout is **deprioritized** — `Allura-ecosystem` is now the source-of-truth **index**, not a code
> monorepo. Individual repos ship independently. New `projects/`, `workspace/`, and `.opencode/`
> governance directories have been added since the original plan.

## Principle
One ecosystem map, one mental model. `Allura-ecosystem` is the index that explains what Allura
is, which projects consume it, and how the pieces connect — it is **not** a code repo. Code
lives in the 10 repos listed in `README.md`. Governance lives in `.opencode/` (agents, skills,
policies, plugins). Local working artifacts live in `projects/` and `workspace/`. Conceptual
integrity: a newcomer should understand the whole map in 60 seconds.

## Current layout (as of 2026-07-25)

```
Allura-ecosystem/                 # source-of-truth index (not a code repo)
├── docs/                         # mirror of Notion (source of truth = Notion)
│   ├── adr/                      # architecture decision records
│   ├── planning/                 # planning docs
│   ├── archive/                  # superseded planning + factory-planning
│   ├── ALLURA-CONSOLIDATION-GOAL.md
│   ├── ALLURA-CONSOLIDATION-PLAN.md
│   ├── ALLURA-LAYOUT.md
│   ├── ARCHITECTURE.md
│   └── journal/                  # session journals
├── projects/                     # local working project artifacts (gitignored)
│   └── allura-memory-mcp/        # photo agent MVP — see DESIGN.md (self-hosted fal.ai photo editor + memory)
├── workspace/                    # local scratch working area (gitignored)
│   ├── memory/
│   └── readme-edits/
├── .opencode/                    # OpenCode runtime config + governance
│   ├── agent/                    # Team RAM agent definitions (core/ + subagents/)
│   ├── skills/                   # 25 skills (see skills table below)
│   ├── policy/                   # governance policies (10 .md files)
│   │   ├── allura-namespace-only.md
│   │   ├── append-only-traces.md
│   │   ├── evidence-before-claims.md
│   │   ├── group_id-required.md
│   │   ├── hitl-promotion-gate.md
│   │   ├── logs-not-knowledge.md
│   │   ├── mcp-only-db-access.md
│   │   ├── ruvector-boundary.md
│   │   └── supersedes-versioning.md
│   ├── plugins/                  # local plugin hooks (allura-governance.ts)
│   ├── config/                   # registry + harness metadata
│   └── manifest.json             # machine-readable architecture manifest
├── Agent-Harnesses/Allura-TeamRam/  # Team RAM harness (separate repo, tracked here)
├── allura-memory/                # Allura Brain app (separate repo, tracked here)
├── allura-plugins/                # plugin catalog (submodule)
├── factory/                       # team manifests + agent templates
├── README.md                      # ecosystem map (10 repos)
├── ECOSYSTEM.md                   # full topology
├── AGENTS.md                      # six-layer architecture + constraints
└── opencode.jsonc                 # OpenCode config
```

## Repo map (current — 10 repos)

| Repo | Role | Visibility |
|------|------|------------|
| [Allura_Memory](https://github.com/Allura-Ecosystem/Allura_Memory) | The brain — core memory engine | Public |
| [Allura-ecosystem](https://github.com/Allura-Ecosystem/Allura-ecosystem) | Ecosystem map — source-of-truth index | Public |
| [allura-team-ram](https://github.com/Allura-Ecosystem/allura-team-ram) | Engineering harness (10 specialists, self-evolving, HITL) | Public |
| [allura-plugins](https://github.com/Allura-Ecosystem/allura-plugins) | Plugin catalog + model governance registry (`models.yaml`) | Private |
| [allura-team-durham](https://github.com/Allura-Ecosystem/allura-team-durham) | Brand harness (design, copy, strategy) | Private |
| [agent-backups](https://github.com/Allura-Ecosystem/agent-backups) | Agent config backups (Hermes, OpenClaw, NanoClaw, OneCLI) | Private |
| [open-design](https://github.com/Allura-Ecosystem/open-design) | Local-first open-source Claude Design alternative (forked) | Public |
| [mortagate](https://github.com/Allura-Ecosystem/mortgate) | Veridact — mortgage audit replay & QC platform on Salesforce | Public |
| [.github](https://github.com/Allura-Ecosystem/.github) | Org profile & community health files | Public |
| [allura](https://github.com/Allura-Ecosystem/allura) | Reserved namespace (points to Allura_Memory) | Public |

## Skills in `.opencode/skills/` (25, including the 13 newer governance/craft skills)

| Skill | Purpose |
|-------|---------|
| `allura-bitwarden-cowork-secret-provider` | Retrieve secrets from Bitwarden for cowork agents without hardcoding |
| `allura-code-review` | Allura-governed review with Pike/Fowler gates + Brain outcome logging |
| `allura-fal-ai-image-editing` | Edit/generate images for Allura-branded artifacts via fal.ai + GPT Image 2 |
| `allura-health-observability` | Check Allura Brain health, queue depth, pipeline status |
| `allura-hydration-integrity` | Separate graph health, semantic retrieval freshness, episodic stream freshness |
| `allura-memory-core` | Core governed memory behavior: retrieve before planning, write trace summaries after |
| `allura-promotion-roundtrip` | Verify HITL receipts, graph storage, and retrieval before declaring promotion done |
| `allura-retrieval-drift-audit` | Diagnose Brain search/get freshness, label drift, missing promoted insights |
| `allura-team-ram` | Allura Team RAM operating core — shared governance, routing, memory, validation gates |
| `carloss-integrity-audit` | Cross-artifact reconciliation for Carlos-guideline projects (six docs + code + env + DB) |
| `code-review` | Generic code review for correctness, regressions, security, contract drift |
| `postgres-best-practices` | Parameterized queries, indexing, connection pooling, migration safety |
| `security-bluebook-builder` | Create/refine concise normative security policy for PII/PHI/financial apps |
| `systematic-debugging-memory` | 5-phase debug: memory hydration → root cause → pattern → hypothesis → fix |
| `varlock` | Secure environment variable management — secrets never exposed in terminals/logs/traces |
| `agent-creator` | Create new OpenCode agents with gpt-5.2-codex default |
| `command-creator` | Create OpenCode custom commands for repeatable tasks |
| `get-started` | Onboarding guide + Chrome DevTools demo |
| `openwork-chrome-mcp-testing` | Chrome MCP verification of OpenWork UI flows |
| `openwork-teams` | Route OpenWork through Team RAM + Team Durham with Brain as shared memory |
| `openwork-testability` | OpenWork testability guidance |
| `plugin-creator` | Create OpenCode plugins + know where to load them |
| `screenpipe` | Screen recording search via REST API + CLI |
| `skill-creator` | Create new OpenCode skills with the standard scaffold |
| `telegram` | Send notifications and messages via Telegram bot API |
| `workspace-guide` | Onboard new users to OpenWork |
| `worktree-workflow` | Worktree-per-task workflow with regular commits + pushes |

## Local project artifacts

- `projects/allura-memory-mcp/DESIGN.md` — the **Allura Photo Agent** MVP (v3). A self-hosted
  Windows-first AI agent that gives a person a Durham-style photo editing experience: a menu
  of fal.ai-powered editing skills, GPT embeddings stored in Postgres, memory MCP + photo
  agent as one product. Single-user, security-first. See the file for the full skill menu.

## Mapping: current → target (historical — most resolved 2026-06-14)

| Current | Target | Note |
| --- | --- | --- |
| `Allura-brandmaker/` | `apps/brandmaker/` | folded in (Phase 2) |
| `ai-agents/` | `apps/agents/` | confirm if app vs library |
| `Client-Projects/mortgage-audit/` | `apps/mortgage-audit/` | client work — confirm if it belongs in this repo |
| `allura-memory/` | `packages/memory/` | submodule → folder (needs decision) |
| `Agent-Harnesses/Allura-TeamRam/` | `packages/team-ram/` | submodule → folder (needs decision) |
| `allura-plugins/` | **stays a submodule** (NOT folded in) | DECIDED: canonical org catalog, own release cycle + validation DoD, cross-runtime (Claude+Codex) |
| `factory/` | `tooling/factory/` | |
| `web/payload/auntie-ny/` | `web/payload/auntie-ny/` (keep) | **DECIDED 2026-06-14**: 93 MB, cloned from `Charitablebusinessronin/auntienyastro-recovered`. Payload 3.x + Next.js 16. Stays in `web/payload/` — gitignored sibling, matches sibling-project pattern. |
| `web/payload/dd-site-payload/` | `web/payload/dd-site-payload/` (keep) | **DECIDED 2026-06-14**: 6.6 GB, pre-moved from `Projects/web/`. Payload 3.82.1 + Next.js 16.2.3 + pnpm 10.33.0 + Vercel Postgres/Blob/Resend. Stays in `web/payload/` — gitignored sibling. |
| `docs/` | `docs/` | **RESOLVED 2026-06-14**: consolidation .md files moved from root into docs/. Now contains ARCHITECTURE.md, ALLURA-CONSOLIDATION-{GOAL,PLAN}.md, ALLURA-LAYOUT.md, journal/. |
| ~~`memory/` (root)~~ | ~~merge into `packages/memory/` or delete~~ | **RESOLVED 2026-06-14**: journal entry moved to `docs/journal/2026-06-11.md`, empty dir deleted. |
| ~~`allura-memory-metadata-fix/`~~ | ~~delete / archive~~ | **RESOLVED**: not present on disk. |
| ~~`mortgage - audit/` (with spaces)~~ | ~~delete~~ | **RESOLVED 2026-06-14**: deleted (68-byte opencode.jsonc stub, redundant with Client-Projects/mortgage-audit/). |
| `.github-public/` | keep as `.github` or `docs/` | submodule — decide |
| `opencode.jsonc` | repo root | keep |
| ~~`opencode.jsonc.bak.20260613-230932`~~ | ~~delete~~ | **RESOLVED 2026-06-14**: deleted (byte-identical to live opencode.jsonc). |
| ~~`.opencode-router/`~~ | ~~delete~~ | **RESOLVED 2026-06-14**: deleted (empty stub, no references). |
| ~~`/media/ronin704/Games/linux-home/.codex/worktrees/{9b72,4376}/auntie ny/`~~ | ~~delete~~ | **RESOLVED 2026-06-14**: 2.6 GB orphan worktrees deleted. Upstream clone is source of truth. |
| ~~`/media/ronin704/Games/Projects/auntie ny/`~~ | ~~delete~~ | **RESOLVED 2026-06-14**: 1.5 GB stale partial from aborted cp -a deleted. |
| `.git-pollution-quarantine-20260613/` | delete | 32 KB stale configs (BehaviorSpec, mcporter.json, policies). Safe to delete. |
| **NEW 2026-07-25** `projects/` | `projects/` (keep, gitignored) | Local working project artifacts — see `allura-memory-mcp/DESIGN.md` (photo agent). |
| **NEW 2026-07-25** `workspace/` | `workspace/` (keep, gitignored) | Local scratch working area (`memory/`, `readme-edits/`). |
| **NEW 2026-07-25** `.opencode/policy/` | `.opencode/policy/` (keep) | 10 governance policies — see `ruvector-boundary.md`, `append-only-traces.md`, etc. |
| **NEW 2026-07-25** `.opencode/plugins/` | `.opencode/plugins/` (keep) | Local plugin hooks — `allura-governance.ts`. |

## README.md — what it should contain

1. **What Allura is** — one paragraph: a self-hosted governed memory engine for AI systems
   (episodic in PostgreSQL + pgvector, semantic via the RuVector graph adapter on PostgreSQL —
   AD-49 cutover 2026-07-12, Neo4j 5.26 read-only fallback).
2. **Ecosystem map** — the repo table above (10 repos), one line per repo on what it does.
3. **Quick start** — clone commands for the brain, a harness, and the plugin catalog.
4. **The Brain** — what `Allura_Memory` is (PostgreSQL episodic + RuVector semantic via
   `IGraphAdapter`), `group_id = allura-system`, how agents read/write it through MCP.
5. **Team RAM** — what the agent harness is, how Brooks + the surgical team operate.
6. **Governance** — six invariant policies (POL-001–006), RuVix gate, decision logging,
   Notion = source of truth (`docs/` is mirror).
7. **Genesis Engine** (new) — SONA trajectories, skill-usage telemetry, pattern detection,
   and HITL-gated skill proposals (AD-51/52/53/54/55). People approve; the engine proposes.
8. **Contributing** — branch/PR flow, CODEOWNERS, "no PR merges without doc updates."
9. **Status** — what's stable (RuVector cutover done, consolidation Phases 0/1/2/4 done) vs
   open (Phase 3 Turborepo deprioritized, native RuVector Stage 2 gated on TALON).

## Open questions (before any move)
1. `ai-agents` and `mortgage-audit`: app or library? client work in this repo or separate?
2. The 3 submodules (memory, team-ram, plugins): convert to folders (matches "one folder")
   or keep as submodules? You folded brand-maker in — same treatment for these?
3. ~~Strays (`memory/`, `allura-memory-metadata-fix/`, `mortgage - audit/`): confirm safe to
   archive/delete once contents are verified merged.~~ **RESOLVED 2026-06-14**: all three strays cleaned.
4. `@allura/*` as the internal package namespace — good?
5. ~~**NEW 2026-06-14**: `web/payload/` path reconciliation — keep as `web/payload/` (current, gitignored sibling) or move to `Client-Projects/payload/` (original ask, under existing client projects)?~~ **RESOLVED 2026-06-14**: `web/payload/` stays. Gitignored sibling, matches sibling-project pattern (`/web/`, `/design/`, `/tools/`).
6. **NEW 2026-07-25**: Should Phase 3 (Turborepo) be revived, or is the ecosystem-map-as-index
   model the permanent shape? Currently leaning index — each repo ships independently.
