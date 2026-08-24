# Epic A-1 — Team RAM Agent Roster Maintenance

**Status:** Planned
**Owner:** Brooks (architecture) + Woz (implementation)
**Tenant:** allura-system
**Repo:** `plugins/allura-team-ram/`

## Goal

Maintain the Team RAM agent roster as a synchronized, drift-free, dual-runtime harness with 11 specialist agent definitions, governance hooks, and a migration framework for skill revisions.

## Product Boundary

`allura-team-ram` is the agent orchestration framework — 10 specialist agents plus Scout, hooks, bin, and migrations. It defines agent behavior contracts, routing, and the HITL governance gate. It does not own the product code or the memory engine.

## Current State

- 11 agent definitions (Brooks, Jobs, Woz, Bellard, Carmack, Scout, Pike, Fowler, Knuth, Hightower, Bahari)
- Hooks: governance-preflight.py, hooks.json
- Bin: agent-sync-check.sh, team-ram.mjs
- Migrations: 001-skill-revisions.sql
- Dual-runtime: Claude-native `agents/` vs OpenCode-native `.opencode/agent/`
- Known drift between the two runtime surfaces

## Story Map

| Story | Outcome | Dependency | Ship condition |
|---|---|---|---|
| A-1.1 | Agent sync drift fix | — | `agents/` and `.opencode/agent/` reconciled, `agent-sync-check.sh` passes |
| A-1.2 | Hook governance — preflight validation | A-1.1 | Governance preflight runs before agent dispatch, blocks on failure |
| A-1.3 | Migration framework — skill-revisions schema | A-1.1 | Migration 001 applied, schema versioned, rollback tested |
| A-1.4 | Dual-runtime parity — Claude vs OpenCode | A-1.1 | Agent definitions produce identical behavior in both runtimes |

## Dependencies

- Allura_Memory `.opencode/agent/` definitions (canonical source)
- OpenCode runtime for agent execution

## Rollback

Agent definitions are declarative. Reverting a definition file reverts agent behavior. No data migration needed.