# Epic P-1 — Plugin Catalog Release

**Status:** Planned
**Owner:** Brooks (architecture) + Woz (implementation)
**Tenant:** allura-system
**Repo:** `plugins/allura-plugins/`

## Goal

Ship the Allura plugin catalog as a validated, publicly releasable set of Claude/Codex/OpenCode plugin packages with CI-verified manifests, expanded eval coverage, and three-way runtime sync.

## Product Boundary

`allura-plugins` is the canonical source and governance repository for the Allura plugin layer. It owns:
1. Plugin catalog — Allura workflow packages and their Claude/Codex manifest surfaces
2. Model governance — agent-to-model mapping registry
3. Release evidence — checks and evidence paths for manifests, commands, examples, hooks, evals, and runtime updates

Plugins add skills, commands, and operating roles. They do not replace Allura Brain or bypass its memory governance.

## Current State

- 3-plugin marketplace: `allura-cowork`, `team-durham`, `team-ram-coding`
- Claude Code and Codex CLI manifests for all 3 plugins
- CI validation: marketplace sources resolve, manifests parse, referenced files exist, no hardcoded paths
- MIT license
- `hermes-allura-brain` connector exists in `plugins/` directory

## Story Map

| Story | Outcome | Dependency | Ship condition |
|---|---|---|---|
| P-1.1 | Marketplace CI hardening | — | Manifests validate, paths resolve, refs exist, no hardcoded paths |
| P-1.2 | Eval fixture expansion | P-1.1 | Eval coverage beyond 5 agents with pass/fail evidence |
| P-1.3 | OpenCode three-way sync | P-1.1 | Claude/Codex/OpenCode surfaces reconciled, drift detected |
| P-1.4 | Per-skill dependency detection | P-1.1 | Skills gracefully no-op when a service is absent |
| P-1.5 | Public release gate | P-1.1, P-1.2, P-1.3, P-1.4 | Full release checklist from docs/PUBLIC-RELEASE-PLAN.md passes |

## Dependencies

- Allura_Memory canonical docs and governance
- Allura Brain MCP server for runtime validation

## Rollback

Plugins are additive — disabling a plugin does not affect the engine or other plugins.